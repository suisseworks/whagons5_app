/**
 * Helpers for resolving the current user's identity and team membership across
 * the two ID spaces this app deals with.
 *
 * Records synced from Convex are mapped so that an entity's `.id` is
 * `pgId ?? _id` — the Postgres integer when the record has one, otherwise the
 * Convex document id string. Foreign-key fields on raw-mapped tables, however,
 * keep the Convex document `_id`. `userTeams.userId` is the clearest example:
 * it is always a Convex `_id`, never a pgId.
 *
 * Comparing `user.id` (a pgId for any normally-synced user) directly against
 * `userTeams.userId` (a Convex `_id`) therefore never matches, which silently
 * collapses team-gated UI — e.g. template visibility in the create-task flow —
 * to empty. These helpers normalize across both id spaces so the join works no
 * matter which representation each side stored.
 */

interface MaybeUser {
  id?: string | number | null;
  _id?: string | number | null;
  pgId?: string | number | null;
}

interface UserTeamRow {
  user_id?: string | number | null;
  userId?: string | number | null;
  team_id?: string | number | null;
  teamId?: string | number | null;
}

/**
 * Collect every id representation (`id`, `_id`, `pgId`) of the current user so a
 * membership lookup matches regardless of which id space a foreign key stored.
 *
 * @param user  The authenticated user; `user.id` is `pgId ?? _id`.
 * @param users The synced `users` collection, used to recover the id space that
 *              `user.id` dropped (e.g. the Convex `_id` when `user.id` is a pgId).
 */
export function resolveCurrentUserIds(
  user: MaybeUser | null | undefined,
  users: any[] | null | undefined,
): Set<string> {
  const ids = new Set<string>();
  if (user?.id == null) return ids;

  ids.add(String(user.id));
  if (user._id != null) ids.add(String(user._id));
  if (user.pgId != null) ids.add(String(user.pgId));

  const userDoc = (users ?? []).find((u: any) =>
    (u?.id != null && String(u.id) === String(user.id))
    || (u?._id != null && String(u._id) === String(user.id))
    || (u?.pgId != null && String(u.pgId) === String(user.id)),
  );
  if (userDoc) {
    if (userDoc._id != null) ids.add(String(userDoc._id));
    if (userDoc.id != null) ids.add(String(userDoc.id));
    if (userDoc.pgId != null) ids.add(String(userDoc.pgId));
  }

  return ids;
}

/**
 * Resolve the team ids the current user belongs to, matching `userTeams` rows by
 * any of the user's id representations. Returned team ids are in whatever id
 * space `userTeams` stores them (Convex `_id`s for the raw-mapped `userTeams`).
 */
export function getUserTeamIds(
  user: MaybeUser | null | undefined,
  users: any[] | null | undefined,
  userTeams: UserTeamRow[] | null | undefined,
): string[] {
  if (user?.id == null || !userTeams) return [];
  const currentUserIds = resolveCurrentUserIds(user, users);
  if (currentUserIds.size === 0) return [];

  return userTeams
    .filter((ut) => {
      const utUserId = ut?.user_id ?? ut?.userId;
      return utUserId != null && currentUserIds.has(String(utUserId));
    })
    .map((ut) => {
      const teamId = ut?.team_id ?? ut?.teamId;
      return teamId != null ? String(teamId) : '';
    })
    .filter((id) => id !== '');
}

/**
 * Expand a list of team ids into every id representation (`_id`, `id`, `pgId`)
 * of each team via the synced `teams` collection.
 *
 * Team references in the data are NOT all stored in the same id space: a
 * category's `teamId` is a Convex `_id`, but `reportingTeamIds` may hold Convex
 * `_id`s OR Postgres pgIds depending on how the category was created. The server
 * matches both (see `inferReportingTeamId` in
 * `convex/_helpers/taskCreationPolicy.ts`), so any client-side membership check
 * must compare against every representation too — otherwise cross-team reporting
 * access silently breaks for whichever space isn't stored.
 */
export function expandTeamIdsAcrossSpaces(
  teamIds: Array<string | number | null | undefined> | null | undefined,
  teams: any[] | null | undefined,
): Set<string> {
  const ids = new Set<string>();
  for (const rawId of teamIds ?? []) {
    if (rawId == null) continue;
    const value = String(rawId);
    ids.add(value);
    const team = (teams ?? []).find((t: any) =>
      (t?._id != null && String(t._id) === value)
      || (t?.id != null && String(t.id) === value)
      || (t?.pgId != null && String(t.pgId) === value),
    );
    if (team) {
      if (team._id != null) ids.add(String(team._id));
      if (team.id != null) ids.add(String(team.id));
      if (team.pgId != null) ids.add(String(team.pgId));
    }
  }
  return ids;
}

/**
 * Convenience: the current user's team ids expanded across all id spaces, ready
 * for `.has(String(ref))` membership checks against either Convex `_id`s or
 * pgIds (e.g. `category.teamId` and `category.reportingTeamIds`).
 */
export function getUserTeamIdSet(
  user: MaybeUser | null | undefined,
  users: any[] | null | undefined,
  userTeams: UserTeamRow[] | null | undefined,
  teams: any[] | null | undefined,
): Set<string> {
  return expandTeamIdsAcrossSpaces(getUserTeamIds(user, users, userTeams), teams);
}
