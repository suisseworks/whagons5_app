import assert from 'node:assert/strict';
import {
  buildCreatableWorkspaces,
  findCreatableWorkspaceById,
  findWorkspaceForCategory,
} from './createTaskWorkspaces';

// ---------------------------------------------------------------------------
// Regression: creating a task into a category the user's team can REPORT to
// (category.reportingTeamIds) must resolve the target workspace even though
// that workspace is not in the user's browsable list. Before the fix, the
// create screen only searched data.workspaces, so picking a reporting-team
// template errored with "No workspace available".
// ---------------------------------------------------------------------------
{
  const ownWorkspace = { _id: 'ws_own', id: 1, pgId: 1, name: 'My Team' };
  const reportingWorkspace = { _id: 'ws_maintenance', id: 2, pgId: 2, name: 'Maintenance' };
  const reportingCategory = {
    _id: 'cat_maintenance',
    workspaceId: 'ws_maintenance',
    teamId: 'team_maintenance',
    reportingTeamIds: ['team_mine'],
  };

  // The reporting workspace is NOT in the browsable list...
  const browsable = [ownWorkspace];
  assert.equal(findWorkspaceForCategory(reportingCategory, browsable), null);

  // ...but it must resolve through the merged creatable list.
  const creatable = buildCreatableWorkspaces(browsable, [reportingWorkspace]);
  assert.equal(findWorkspaceForCategory(reportingCategory, creatable), reportingWorkspace);
  assert.equal(findCreatableWorkspaceById('ws_maintenance', creatable), reportingWorkspace);
}

// Merging dedupes by _id (a workspace that is both browsable and reportable
// must not appear twice) and skips rows without an _id.
{
  const shared = { _id: 'ws_shared', name: 'Shared' };
  const merged = buildCreatableWorkspaces(
    [shared, { name: 'no-id row' }],
    [{ ...shared }, { _id: 'ws_other', name: 'Other' }],
  );
  assert.deepEqual(merged.map((w) => w._id), ['ws_shared', 'ws_other']);
  // First occurrence (the browsable doc) wins.
  assert.equal(merged[0], shared);
}

// Null/undefined inputs behave like empty lists.
{
  assert.deepEqual(buildCreatableWorkspaces(null, undefined), []);
  assert.equal(findWorkspaceForCategory({ workspaceId: 'ws_x' }, null), null);
  assert.equal(findCreatableWorkspaceById(null, []), null);
}

// Legacy id spaces: category.workspace_id may hold a pgId instead of the
// Convex _id — matching must span _id, id and pgId.
{
  const workspace = { _id: 'ws_convex', id: 7, pgId: 7, name: 'Legacy' };
  assert.equal(findWorkspaceForCategory({ workspace_id: 7 }, [workspace]), workspace);
  assert.equal(findWorkspaceForCategory({ workspaceId: 'ws_convex' }, [workspace]), workspace);
}

// Categories without any workspace reference resolve to null (create flow
// falls back to its existing error handling).
{
  assert.equal(findWorkspaceForCategory({}, [{ _id: 'ws_a' }]), null);
  assert.equal(findWorkspaceForCategory({ workspaceId: '' }, [{ _id: 'ws_a' }]), null);
}

console.log('createTaskWorkspaces tests passed');
