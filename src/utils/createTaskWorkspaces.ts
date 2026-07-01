/**
 * Workspace resolution for the create-task flow.
 *
 * Task creation requires a workspace id, but the browsable workspace list
 * (data.workspaces) only contains workspaces of the user's own teams. When a
 * user creates a task into a category their team can *report* to
 * (category.reportingTeamIds), the target workspace arrives separately as
 * data.reportingWorkspaces. The create flow must resolve against the merged
 * list or it dead-ends with "No workspace available".
 */

export const getCategoryWorkspaceId = (category: any) =>
  category?.workspace_id ?? category?.workspaceId ?? null;

/** Merge browsable + reporting workspaces, deduped by Convex _id. */
export function buildCreatableWorkspaces(
  workspaces: any[] | null | undefined,
  reportingWorkspaces?: any[] | null,
): any[] {
  const merged: any[] = [];
  const seen = new Set<string>();
  for (const workspace of [...(workspaces ?? []), ...(reportingWorkspaces ?? [])]) {
    const key = workspace?._id != null ? String(workspace._id) : null;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(workspace);
  }
  return merged;
}

/** Find a category's workspace, matching across Convex _id, app id and pgId. */
export function findWorkspaceForCategory(
  category: any,
  workspaces: any[] | null | undefined,
): any | null {
  const workspaceId = getCategoryWorkspaceId(category);
  if (workspaceId == null || workspaceId === '') return null;
  return (workspaces ?? []).find((workspace: any) =>
    String(workspace._id) === String(workspaceId)
    || String(workspace.id) === String(workspaceId)
    || String(workspace.pgId) === String(workspaceId)
  ) ?? null;
}

/** Find a workspace by its Convex _id in the merged creatable list. */
export function findCreatableWorkspaceById(
  workspaceId: string | null | undefined,
  workspaces: any[] | null | undefined,
): any | null {
  if (workspaceId == null || workspaceId === '') return null;
  return (workspaces ?? []).find((workspace: any) => String(workspace._id) === String(workspaceId)) ?? null;
}
