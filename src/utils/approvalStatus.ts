export type DerivedApprovalStatus = 'pending' | 'approved' | 'rejected';

function normStatus(s: any): string {
  return (s ?? '').toString().toLowerCase().trim();
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
      if (i?.task_id == null) return false;
      const instTaskId = String(i.task_id);
      return instTaskId === String(taskId) || (taskConvexId && instTaskId === taskConvexId);
    }
  );

  if (instances.length === 0) return 'pending';

  const required = instances.filter((i: any) => i?.is_required !== false);
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
  approverRoleId?: number | string | null;
  approverTeamId?: number | string | null;
  memberUserIds?: (number | string)[];
  signatureStorageId?: string | null;
}

export function buildApproverDetails(
  approvalId: number | string,
  taskId: number | string,
  taskApprovalInstances: any[],
  approvalApprovers: any[],
  userMap: Record<string | number, any>,
  roleMap: Record<string | number, any>,
  teamMap?: Record<string | number, any>,
  taskConvexId?: string,
): ApproverDetail[] {
  let approverDetails: ApproverDetail[] = [];

  if (approvalId && taskApprovalInstances.length > 0) {
    const instances = taskApprovalInstances
      .filter((inst: any) => {
        if (inst.task_id == null) return false;
        const instTaskId = String(inst.task_id);
        return instTaskId === String(taskId) || instTaskId === String(taskConvexId);
      })
      .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));

    const groupedBySource = new Map<string, any[]>();
    for (const inst of instances) {
      const key = inst.source_approver_id ? String(inst.source_approver_id) : `direct-${inst.id}`;
      if (!groupedBySource.has(key)) groupedBySource.set(key, []);
      groupedBySource.get(key)!.push(inst);
    }

    let stepIdx = 0;
    for (const [sourceKey, group] of groupedBySource) {
      const sourceApprover = sourceKey.startsWith('direct-') ? null
        : (Array.isArray(approvalApprovers) ? approvalApprovers.find((ap: any) => String(ap.id) === sourceKey) : null);
      const isTeamBased = sourceApprover?.approver_type === 'team';
      const isRoleBased = sourceApprover?.approver_type === 'role';

      if (isTeamBased) {
        const teamId = sourceApprover.approver_id ?? sourceApprover.approverId;
        const teamName = teamMap?.[String(teamId)]?.name || teamMap?.[Number(teamId)]?.name || 'Team';
        const approvedCount = group.filter((i: any) => (i.status || '').toLowerCase() === 'approved').length;
        const rejectedCount = group.filter((i: any) => (i.status || '').toLowerCase() === 'rejected').length;
        const hasReject = rejectedCount > 0;
        const allApproved = approvedCount === group.length;
        const aggregateStatus = hasReject ? 'rejected' : allApproved ? 'approved' : 'pending';
        const memberUserIds = group.map((i: any) => i.approver_user_id).filter(Boolean);
        approverDetails.push({
          id: sourceKey,
          name: teamName,
          status: aggregateStatus,
          statusColor: aggregateStatus === 'approved' ? '#16a34a' : aggregateStatus === 'rejected' ? '#dc2626' : '#2563eb',
          isRequired: group.some((i: any) => i.is_required !== false),
          step: ++stepIdx,
          respondedAt: group.find((i: any) => i.responded_at)?.responded_at || null,
          comment: group.find((i: any) => i.response_comment)?.response_comment || null,
          approverUserId: null,
          approverRoleId: null,
          approverTeamId: teamId,
          memberUserIds,
          signatureStorageId: group.find((i: any) => i.signatureStorageId || i.signature_storage_id)?.signatureStorageId
            || group.find((i: any) => i.signature_storage_id)?.signature_storage_id || null,
        });
      } else {
        for (const inst of group) {
          const roleId = isRoleBased ? (sourceApprover?.approver_id ?? sourceApprover?.approverId) : null;
          const userRecord = inst.approver_user_id != null
            ? ((userMap?.[Number(inst.approver_user_id)]) || (userMap?.[String(inst.approver_user_id)]) || null)
            : null;
          let displayName: string;
          if (userRecord) {
            displayName = userRecord.name || userRecord.email || `User #${inst.approver_user_id}`;
          } else if (isRoleBased && roleId) {
            displayName = roleMap[roleId]?.name || roleMap[String(roleId)]?.name || `Role #${roleId}`;
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
            isRequired: inst.is_required !== false,
            step: ++stepIdx,
            respondedAt: inst.responded_at,
            comment: inst.response_comment,
            approverUserId: inst.approver_user_id != null ? inst.approver_user_id : null,
            approverRoleId: roleId,
            signatureStorageId: inst.signatureStorageId || inst.signature_storage_id || null,
          });
        }
      }
    }
  }

  if (approverDetails.length === 0 && approvalId && Array.isArray(approvalApprovers)) {
    const configuredApprovers = approvalApprovers
      .filter((ap: any) => ap.approval_id != null && String(ap.approval_id) === String(approvalId))
      .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));
    if (configuredApprovers.length > 0) {
      approverDetails = configuredApprovers.map((config: any, idx: number) => {
        const approverType = config.approver_type ?? config.approverType;
        const approverId = config.approver_id ?? config.approverId;
        const userRecord = approverType === 'user'
          ? ((userMap?.[Number(approverId)]) || (userMap?.[String(approverId)]) || null)
          : null;
        const name = userRecord
          ? (userRecord.name || userRecord.email || `User #${approverId}`)
          : (
            approverType === 'role'
              ? (roleMap[Number(approverId)]?.name || roleMap[String(approverId)]?.name || `Role #${approverId}`)
              : approverType === 'team'
                ? (teamMap?.[String(approverId)]?.name || teamMap?.[Number(approverId)]?.name || config.approver_label || 'Team')
                : config.approver_label || `Approver ${idx + 1}`
          );
        return {
          id: config.id ?? `config-${idx}`,
          name,
          status: 'not started',
          statusColor: '#9ca3af',
          isRequired: config.required !== false,
          step: (config.order_index ?? idx) + 1,
          respondedAt: null,
          comment: null,
          approverUserId: approverType === 'user' && approverId ? approverId : null,
          approverRoleId: approverType === 'role' && approverId ? approverId : null,
          approverTeamId: approverType === 'team' && approverId ? approverId : null,
        };
      });
    }
  }

  return approverDetails;
}
