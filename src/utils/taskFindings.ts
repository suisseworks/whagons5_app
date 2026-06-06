export interface TaskFindingLinkedTask {
  _id?: string;
  name?: string | null;
  statusName?: string | null;
  statusColor?: string | null;
  statusFinal?: boolean;
  completed?: boolean;
  completedAt?: number | string | null;
}

export interface TaskFindingRow {
  _id: string;
  text: string;
  resolved?: boolean;
  notes?: string | null;
  priority?: string | null;
  dueDate?: number | null;
  sortOrder?: number | null;
  createdAt?: number | null;
  updatedAt?: number | null;
  linkedTaskId?: string | null;
  linkedTask?: TaskFindingLinkedTask | null;
}

export interface TaskFindingsSummary {
  total: number;
  corrected: number;
  inProgress: number;
  pending: number;
}

export function isTaskFindingResolved(finding: Pick<TaskFindingRow, 'resolved' | 'linkedTask'>): boolean {
  return finding.resolved === true || finding.linkedTask?.completed === true || finding.linkedTask?.statusFinal === true;
}

export function getTaskFindingsSummary(findings: TaskFindingRow[]): TaskFindingsSummary {
  return findings.reduce<TaskFindingsSummary>((summary, finding) => {
    summary.total += 1;
    if (isTaskFindingResolved(finding)) {
      summary.corrected += 1;
    } else if (finding.linkedTaskId || finding.linkedTask) {
      summary.inProgress += 1;
    } else {
      summary.pending += 1;
    }
    return summary;
  }, { total: 0, corrected: 0, inProgress: 0, pending: 0 });
}

export function sortTaskFindingsForMobile(findings: TaskFindingRow[]): TaskFindingRow[] {
  return [...findings].sort((a, b) => {
    const aResolved = isTaskFindingResolved(a);
    const bResolved = isTaskFindingResolved(b);
    if (aResolved !== bResolved) return aResolved ? 1 : -1;
    return (a.sortOrder ?? a.createdAt ?? 0) - (b.sortOrder ?? b.createdAt ?? 0);
  });
}
