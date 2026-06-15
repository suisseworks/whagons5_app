export type DerivedApprovalStatus = 'pending' | 'approved' | 'rejected';

function normStatus(s: any): string {
  return (s ?? '').toString().toLowerCase().trim();
}

function field(row: any, snake: string, camel: string): any {
  return row?.[snake] ?? row?.[camel];
}

export function computeApprovalStatusForTask(opts: {
  taskId: number | string;
  taskConvexId?: string;
  approvalId?: number | string | null;
  approval?: any;
  taskApprovalInstances?: any[];
}): DerivedApprovalStatus | null {
  const { taskId, taskConvexId, approvalId, approval, taskApprovalInstances } = opts;
  if (!approvalId) return null;

  const instances = (taskApprovalInstances || []).filter(
    (i: any) => {
      const rawTaskId = field(i, 'task_id', 'taskId');
      if (rawTaskId == null) return false;
      const instTaskId = String(rawTaskId);
      return instTaskId === String(taskId) || (taskConvexId && instTaskId === taskConvexId);
    }
  );

  if (instances.length === 0) return null;

  const required = instances.filter((i: any) => field(i, 'is_required', 'isRequired') !== false);
  const requiredSet = required.length > 0 ? required : instances;

  const hasReject = requiredSet.some((i: any) => normStatus(i?.status) === 'rejected');
  if (hasReject) return 'rejected';

  const approvedCount = requiredSet.filter((i: any) => normStatus(i?.status) === 'approved').length;
  const totalRequired = requiredSet.length;

  const approvalType = normStatus(approval?.approval_type || 'all');
  const requireAll = approval?.require_all !== false;
  const minimumApprovals = Number.isFinite(Number(approval?.minimum_approvals))
    ? Number(approval.minimum_approvals)
    : totalRequired;

  const isComplete = (() => {
    if (totalRequired <= 0) return false;
    switch (approvalType) {
      case 'single':
        return approvedCount >= 1;
      case 'majority':
        return approvedCount >= Math.max(1, Math.ceil(totalRequired / 2));
      case 'sequential':
        return approvedCount >= totalRequired;
      case 'all':
      default:
        return requireAll ? approvedCount >= totalRequired : approvedCount >= Math.max(1, minimumApprovals);
    }
  })();

  return isComplete ? 'approved' : 'pending';
}

export interface ApproverDetail {
  id: number | string;
  name: string;
  status: string;
  statusColor: string;
  isRequired: boolean;
  step: number;
  respondedAt?: string | null;
  comment?: string | null;
  approverUserId?: number | string | null;
  approverTeamId?: number | string | null;
  memberUserIds?: (number | string)[];
  signatureStorageId?: string | null;
  memberDetails?: Array<{
    id: number | string;
    name: string;
    status: string;
    statusColor: string;
    respondedAt?: string | null;
    comment?: string | null;
    signatureStorageId?: string | null;
  }>;
}

export interface ApprovalProgressSummary {
  total: number;
  approved: number;
  rejected: number;
  pending: number;
  skipped: number;
}

export function getApprovalProgressSummary(approverDetails: ApproverDetail[] = []): ApprovalProgressSummary {
  return approverDetails
    .flatMap((detail) => detail.memberDetails?.length ? detail.memberDetails : [detail])
    .reduce<ApprovalProgressSummary>((summary, detail) => {
      const status = normStatus(detail.status || 'pending');
      summary.total += 1;
      if (status === 'approved') summary.approved += 1;
      else if (status === 'rejected') summary.rejected += 1;
      else if (status === 'skipped') summary.skipped += 1;
      else summary.pending += 1;
      return summary;
    }, { total: 0, approved: 0, rejected: 0, pending: 0, skipped: 0 });
}

export function buildApproverDetails(
  approvalId: number | string,
  taskId: number | string,
  taskApprovalInstances: any[],
  approvalApprovers: any[],
  userMap: Record<string | number, any>,
  teamMap?: Record<string | number, any>,
  taskConvexId?: string,
): ApproverDetail[] {
  let approverDetails: ApproverDetail[] = [];

  if (approvalId && taskApprovalInstances.length > 0) {
    const instances = taskApprovalInstances
      .filter((inst: any) => {
        const rawTaskId = field(inst, 'task_id', 'taskId');
        if (rawTaskId == null) return false;
        const instTaskId = String(rawTaskId);
        return instTaskId === String(taskId) || instTaskId === String(taskConvexId);
      })
      .sort((a: any, b: any) => (field(a, 'order_index', 'orderIndex') ?? 0) - (field(b, 'order_index', 'orderIndex') ?? 0));

    const groupedBySource = new Map<string, any[]>();
    for (const inst of instances) {
      const sourceApproverId = field(inst, 'source_approver_id', 'sourceApproverId');
      const key = sourceApproverId ? String(sourceApproverId) : `direct-${inst.id}`;
      if (!groupedBySource.has(key)) groupedBySource.set(key, []);
      groupedBySource.get(key)!.push(inst);
    }

    let stepIdx = 0;
    for (const [sourceKey, group] of groupedBySource) {
      const sourceApprover = sourceKey.startsWith('direct-') ? null
        : (Array.isArray(approvalApprovers) ? approvalApprovers.find((ap: any) => String(ap._id ?? '') === sourceKey || String(ap.id) === sourceKey) : null);
      const approverType = field(sourceApprover, 'approver_type', 'approverType');
      const isTeamBased = approverType === 'team';

      if (isTeamBased) {
        const teamId = field(sourceApprover, 'approver_id', 'approverId');
        const teamName = teamMap?.[String(teamId)]?.name || teamMap?.[Number(teamId)]?.name || 'Team';
        const approvedCount = group.filter((i: any) => (i.status || '').toLowerCase() === 'approved').length;
        const rejectedCount = group.filter((i: any) => (i.status || '').toLowerCase() === 'rejected').length;
        const pendingCount = group.filter((i: any) => ['pending', 'not started', ''].includes((i.status || 'pending').toLowerCase())).length;
        const hasReject = rejectedCount > 0;
        const aggregateStatus = hasReject ? 'rejected' : pendingCount > 0 ? 'pending' : approvedCount > 0 ? 'approved' : 'skipped';
        const memberUserIds = group.map((i: any) => field(i, 'approver_user_id', 'approverUserId')).filter(Boolean);
        const memberDetails = group.map((i: any, idx: number) => {
          const approverUserId = field(i, 'approver_user_id', 'approverUserId');
          const userRecord = approverUserId != null
            ? ((userMap?.[Number(approverUserId)]) || (userMap?.[String(approverUserId)]) || null)
            : null;
          const normalizedStatus = (i.status || 'pending').toString().toLowerCase();
          return {
            id: approverUserId ?? i.id ?? `${sourceKey}-${idx}`,
            name: userRecord ? (userRecord.name || userRecord.email || `User #${approverUserId}`) : `Approver ${idx + 1}`,
            status: normalizedStatus,
            statusColor: normalizedStatus === 'approved' ? '#16a34a'
              : normalizedStatus === 'rejected' ? '#dc2626'
              : normalizedStatus === 'skipped' ? '#d97706' : '#2563eb',
            respondedAt: field(i, 'responded_at', 'respondedAt'),
            comment: field(i, 'response_comment', 'responseComment'),
            signatureStorageId: i.signatureStorageId || i.signature_storage_id || null,
          };
        });
        approverDetails.push({
          id: sourceKey,
          name: teamName,
          status: aggregateStatus,
          statusColor: aggregateStatus === 'approved' ? '#16a34a' : aggregateStatus === 'rejected' ? '#dc2626' : '#2563eb',
          isRequired: group.some((i: any) => field(i, 'is_required', 'isRequired') !== false),
          step: ++stepIdx,
          respondedAt: group.map((i: any) => field(i, 'responded_at', 'respondedAt')).find(Boolean) || null,
          comment: group.map((i: any) => field(i, 'response_comment', 'responseComment')).find(Boolean) || null,
          approverUserId: null,
          approverTeamId: teamId,
          memberUserIds,
          memberDetails,
          signatureStorageId: group.find((i: any) => i.signatureStorageId || i.signature_storage_id)?.signatureStorageId
            || group.find((i: any) => i.signature_storage_id)?.signature_storage_id || null,
        });
      } else {
        for (const inst of group) {
          const approverUserId = field(inst, 'approver_user_id', 'approverUserId');
          const userRecord = approverUserId != null
            ? ((userMap?.[Number(approverUserId)]) || (userMap?.[String(approverUserId)]) || null)
            : null;
          let displayName: string;
          if (userRecord) {
            displayName = userRecord.name || userRecord.email || `User #${approverUserId}`;
          } else if (approverType && !['user', 'team', 'job_position'].includes(String(approverType))) {
            displayName = 'Unsupported legacy approver';
          } else {
            displayName = inst.approver_name || `Approver ${stepIdx + 1}`;
          }
          const normalizedStatus = (inst.status || 'pending').toString().toLowerCase();
          approverDetails.push({
            id: inst.id ?? `${inst.task_id}-${stepIdx}`,
            name: displayName,
            status: normalizedStatus,
            statusColor: normalizedStatus === 'approved' ? '#16a34a'
              : normalizedStatus === 'rejected' ? '#dc2626'
              : normalizedStatus === 'skipped' ? '#d97706' : '#2563eb',
            isRequired: field(inst, 'is_required', 'isRequired') !== false,
            step: ++stepIdx,
            respondedAt: field(inst, 'responded_at', 'respondedAt'),
            comment: field(inst, 'response_comment', 'responseComment'),
            approverUserId: approverUserId != null ? approverUserId : null,
            signatureStorageId: inst.signatureStorageId || inst.signature_storage_id || null,
          });
        }
      }
    }
  }

  if (approverDetails.length === 0 && approvalId && Array.isArray(approvalApprovers)) {
    const configuredApprovers = approvalApprovers
      .filter((ap: any) => field(ap, 'approval_id', 'approvalId') != null && String(field(ap, 'approval_id', 'approvalId')) === String(approvalId))
      .sort((a: any, b: any) => (field(a, 'order_index', 'orderIndex') ?? 0) - (field(b, 'order_index', 'orderIndex') ?? 0));
    if (configuredApprovers.length > 0) {
      approverDetails = configuredApprovers.map((config: any, idx: number) => {
        const approverType = field(config, 'approver_type', 'approverType');
        const approverId = field(config, 'approver_id', 'approverId');
        const userRecord = approverType === 'user'
          ? ((userMap?.[Number(approverId)]) || (userMap?.[String(approverId)]) || null)
          : null;
        const name = userRecord
          ? (userRecord.name || userRecord.email || `User #${approverId}`)
          : (
            approverType === 'team'
                ? (teamMap?.[String(approverId)]?.name || teamMap?.[Number(approverId)]?.name || config.approver_label || 'Team')
                : approverType === 'job_position'
                  ? config.approver_label || 'Job position approver'
                  : ['user', 'team', 'job_position'].includes(String(approverType))
                    ? config.approver_label || `Approver ${idx + 1}`
                    : 'Unsupported legacy approver'
          );
        return {
          id: config.id ?? `config-${idx}`,
          name,
          status: 'not started',
          statusColor: '#9ca3af',
          isRequired: config.required !== false,
          step: (field(config, 'order_index', 'orderIndex') ?? idx) + 1,
          respondedAt: null,
          comment: null,
          approverUserId: approverType === 'user' && approverId ? approverId : null,
          approverTeamId: approverType === 'team' && approverId ? approverId : null,
        };
      });
    }
  }

  return approverDetails;
}
