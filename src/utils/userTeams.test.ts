import assert from 'node:assert/strict';
import {
  expandTeamIdsAcrossSpaces,
  getUserTeamIdSet,
  getUserTeamIds,
  resolveCurrentUserIds,
} from './userTeams';

// ---------------------------------------------------------------------------
// Regression: a user with a pgId must still match userTeams rows that store the
// Convex `_id` in `userId`. Before the fix, `user.id` (pgId) was compared
// directly against `userTeams.userId` (Convex `_id`), so any normally-synced
// user matched zero teams and the create-task screen showed no templates.
// ---------------------------------------------------------------------------
{
  const user = { id: 42 }; // user.id is the pgId (AuthContext: pgId ?? _id)
  const users = [{ _id: 'convex_user_ariana', id: 42, pgId: 42, name: 'Ariana' }];
  const userTeams = [
    { userId: 'convex_user_ariana', teamId: 'convex_team_housekeeping' },
    { userId: 'convex_user_someone_else', teamId: 'convex_team_other' },
  ];

  const teamIds = getUserTeamIds(user, users, userTeams);
  assert.deepEqual(teamIds, ['convex_team_housekeeping']);
}

// A user without a pgId (user.id === Convex _id) keeps matching — this is the
// account that "always worked" and made the bug hard to reproduce.
{
  const user = { id: 'convex_user_malek' };
  const users = [{ _id: 'convex_user_malek', id: 'convex_user_malek', name: 'Malek' }];
  const userTeams = [{ userId: 'convex_user_malek', teamId: 'convex_team_housekeeping' }];

  assert.deepEqual(getUserTeamIds(user, users, userTeams), ['convex_team_housekeeping']);
}

// Snake_case row fields (user_id / team_id) are matched too.
{
  const user = { id: 7 };
  const users = [{ _id: 'convex_user_x', id: 7, pgId: 7 }];
  const userTeams = [{ user_id: 'convex_user_x', team_id: 'convex_team_a' }];

  assert.deepEqual(getUserTeamIds(user, users, userTeams), ['convex_team_a']);
}

// Multiple memberships are all returned; other users' rows are excluded.
{
  const user = { id: 99 };
  const users = [{ _id: 'cu_99', id: 99, pgId: 99 }];
  const userTeams = [
    { userId: 'cu_99', teamId: 'team_1' },
    { userId: 'cu_99', teamId: 'team_2' },
    { userId: 'cu_other', teamId: 'team_3' },
  ];

  assert.deepEqual(getUserTeamIds(user, users, userTeams).sort(), ['team_1', 'team_2']);
}

// No matching membership returns an empty list.
{
  const user = { id: 1 };
  const users = [{ _id: 'cu_1', id: 1, pgId: 1 }];
  const userTeams = [{ userId: 'cu_2', teamId: 'team_z' }];

  assert.deepEqual(getUserTeamIds(user, users, userTeams), []);
}

// Defensive: null / undefined inputs never throw and return empty.
{
  assert.deepEqual(getUserTeamIds(null, [], []), []);
  assert.deepEqual(getUserTeamIds(undefined, undefined, undefined), []);
  assert.deepEqual(getUserTeamIds({ id: 1 }, null, null), []);
  assert.deepEqual(getUserTeamIds({ id: null }, [], [{ userId: 'x', teamId: 'y' }]), []);
}

// Rows missing a team id are dropped rather than emitting "undefined".
{
  const user = { id: 5 };
  const users = [{ _id: 'cu_5', id: 5, pgId: 5 }];
  const userTeams = [
    { userId: 'cu_5' },
    { userId: 'cu_5', teamId: 'team_ok' },
  ];

  assert.deepEqual(getUserTeamIds(user, users, userTeams), ['team_ok']);
}

// ---------------------------------------------------------------------------
// resolveCurrentUserIds collects every id representation of the current user.
// ---------------------------------------------------------------------------
{
  const ids = resolveCurrentUserIds(
    { id: 42 },
    [{ _id: 'convex_user_ariana', id: 42, pgId: 42 }],
  );
  assert.ok(ids.has('42'), 'includes the pgId');
  assert.ok(ids.has('convex_user_ariana'), 'recovers the Convex _id from the users collection');
}

{
  // Works even when only the Convex _id is known and the users list is empty.
  const ids = resolveCurrentUserIds({ id: 'convex_user_only' }, []);
  assert.ok(ids.has('convex_user_only'));
}

{
  // A null user yields an empty set.
  assert.equal(resolveCurrentUserIds(null, []).size, 0);
}

// ---------------------------------------------------------------------------
// expandTeamIdsAcrossSpaces bridges Convex `_id` <-> pgId so a membership check
// matches `reportingTeamIds` whether the category stored Convex ids or pgIds.
// ---------------------------------------------------------------------------
{
  const teams = [{ _id: 'convex_team_hk', id: 7, pgId: 7, name: 'Housekeeping' }];
  // The user is known to belong to the team by its Convex _id (from userTeams).
  const expanded = expandTeamIdsAcrossSpaces(['convex_team_hk'], teams);

  // A category that reports to this team via the Convex _id matches...
  assert.ok(expanded.has('convex_team_hk'));
  // ...and a category that stored the *pgId* in reportingTeamIds matches too.
  assert.ok(expanded.has('7'), 'pgId representation is included so pgId-stored reportingTeamIds match');
}

{
  // Unknown team id (not in the teams collection) is still kept verbatim.
  const expanded = expandTeamIdsAcrossSpaces(['team_unknown'], []);
  assert.ok(expanded.has('team_unknown'));
}

{
  // Null/empty inputs are safe.
  assert.equal(expandTeamIdsAcrossSpaces(null, null).size, 0);
  assert.equal(expandTeamIdsAcrossSpaces([null, undefined], []).size, 0);
}

// ---------------------------------------------------------------------------
// getUserTeamIdSet: end-to-end, the regression scenario plus cross-space report.
// A pgId user, userTeams keyed by Convex _id, and a category whose
// reportingTeamIds holds the *pgId* — must still resolve as accessible.
// ---------------------------------------------------------------------------
{
  const user = { id: 42 };
  const users = [{ _id: 'cu_ariana', id: 42, pgId: 42 }];
  const userTeams = [{ userId: 'cu_ariana', teamId: 'convex_team_hk' }];
  const teams = [{ _id: 'convex_team_hk', id: 7, pgId: 7 }];

  const set = getUserTeamIdSet(user, users, userTeams, teams);

  // Direct ownership: category.teamId is a Convex _id.
  assert.ok(set.has('convex_team_hk'), 'matches category.teamId (Convex _id)');
  // Cross-team reporting: reportingTeamIds may be stored as the pgId.
  assert.ok(set.has('7'), 'matches reportingTeamIds stored as pgId');
}

process.stdout.write('userTeams utils tests passed\n');
