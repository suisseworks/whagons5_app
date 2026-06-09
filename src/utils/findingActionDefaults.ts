function rowId(row: any): string {
  return String(row?._id ?? row?.id ?? '');
}

function matchesId(row: any, id: any): boolean {
  if (id == null || id === '') return false;
  const target = String(id);
  return [row?._id, row?.id, row?.pgId].some((value) => value != null && value !== '' && String(value) === target);
}

function isAlive(row: any) {
  return row && !row.deletedAt && !row.deleted_at;
}

export function resolveFindingTargetWorkspaceId(
  defaults: Record<string, any>,
  sourceTask: Record<string, any> | null | undefined,
): string {
  const mode = defaults.targetWorkspaceMode ?? defaults.target_workspace_mode;
  if (mode === 'fixed') {
    const fixedId = defaults.targetWorkspaceId ?? defaults.target_workspace_id;
    if (fixedId != null && fixedId !== '') return String(fixedId);
  }
  const sourceWorkspaceId = sourceTask?.workspaceId ?? sourceTask?.workspace_id;
  return sourceWorkspaceId != null && sourceWorkspaceId !== '' ? String(sourceWorkspaceId) : '';
}

export function resolveTeamForFindingWorkspace(
  workspaceId: string,
  {
    teams = [],
    workspaces = [],
    categories = [],
  }: {
    teams?: any[];
    workspaces?: any[];
    categories?: any[];
  },
): string {
  if (!workspaceId) return '';

  const workspace = workspaces.find((row) => matchesId(row, workspaceId));
  if (!workspace) return '';

  const aliveTeams = teams.filter(isAlive);

  const findingsTeam = aliveTeams.find((team) => {
    const findingsWorkspaceId = team.findingsWorkspaceId ?? team.findings_workspace_id;
    return findingsWorkspaceId != null && String(findingsWorkspaceId) === String(workspaceId);
  });
  if (findingsTeam) return rowId(findingsTeam);

  const defaultWorkspaceTeam = aliveTeams.find((team) => {
    const defaultWorkspaceId = team.defaultWorkspaceId ?? team.default_workspace_id;
    return defaultWorkspaceId != null && String(defaultWorkspaceId) === String(workspaceId);
  });
  if (defaultWorkspaceTeam) return rowId(defaultWorkspaceTeam);

  const workspaceTeamIds = Array.isArray(workspace.teams) ? workspace.teams : [];
  for (const teamRef of workspaceTeamIds) {
    const team = aliveTeams.find((row) => matchesId(row, teamRef));
    if (team) return rowId(team);
  }

  const workspaceCategoryId = workspace.categoryId ?? workspace.category_id;
  if (workspaceCategoryId) {
    const category = categories.find((row) => matchesId(row, workspaceCategoryId));
    const categoryTeamId = category?.teamId ?? category?.team_id;
    if (categoryTeamId) {
      const team = aliveTeams.find((row) => matchesId(row, categoryTeamId));
      if (team) return rowId(team);
    }
  }

  const linkedCategory = categories.find((category) => {
    if (!isAlive(category)) return false;
    const categoryWorkspaceId = category.workspaceId ?? category.workspace_id;
    return categoryWorkspaceId != null && String(categoryWorkspaceId) === String(workspaceId);
  });
  const linkedCategoryTeamId = linkedCategory?.teamId ?? linkedCategory?.team_id;
  if (linkedCategoryTeamId) {
    const team = aliveTeams.find((row) => matchesId(row, linkedCategoryTeamId));
    if (team) return rowId(team);
  }

  return '';
}

export function resolveDefaultFindingTargetTeamId(
  defaults: Record<string, any>,
  sourceTask: Record<string, any> | null | undefined,
  lookup: {
    teams?: any[];
    workspaces?: any[];
    categories?: any[];
  },
): string {
  const explicitTeamId = defaults.teamId ?? defaults.team_id;
  if (explicitTeamId != null && explicitTeamId !== '') return String(explicitTeamId);

  const workspaceId = resolveFindingTargetWorkspaceId(defaults, sourceTask);
  return resolveTeamForFindingWorkspace(workspaceId, lookup);
}
