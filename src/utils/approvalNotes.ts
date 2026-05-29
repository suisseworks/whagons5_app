export type ApprovalDecisionNote = {
  decision: 'approved' | 'rejected';
  actorName: string | null;
  comment: string;
};

export function parseApprovalDecisionNote(text: string | null | undefined): ApprovalDecisionNote | null {
  if (!text) return null;

  if (text.includes('[Approval decision]')) {
    const body = text.replace('[Approval decision]', '').trim();
    const decision = body.match(/^Decision:\s*(approved|rejected)$/im)?.[1]?.toLowerCase() as 'approved' | 'rejected' | undefined;
    if (!decision) return null;
    const actorMatch = body.match(/^(?:Approved|Rejected) by:\s*(.+)$/im);
    const actorName = actorMatch?.[1]?.trim() || null;
    const comment = body
      .replace(/^Decision:\s*(approved|rejected)$/im, '')
      .replace(/^(?:Approved|Rejected) by:\s*.+$/im, '')
      .trim();
    return { decision, actorName, comment };
  }

  if (text.includes('[Approval rejection]')) {
    const body = text.replace('[Approval rejection]', '').trim();
    const rejectedByMatch = body.match(/^Rejected by:\s*(.+)$/m);
    const actorName = rejectedByMatch?.[1]?.trim() || null;
    const comment = body.replace(/^Rejected by:\s*.+$/m, '').trim();
    return { decision: 'rejected', actorName, comment };
  }

  if (text.includes('[Approval approved]')) {
    const body = text.replace('[Approval approved]', '').trim();
    const approvedByMatch = body.match(/^Approved by:\s*(.+)$/m);
    const actorName = approvedByMatch?.[1]?.trim() || null;
    const comment = body.replace(/^Approved by:\s*.+$/m, '').trim();
    return { decision: 'approved', actorName, comment };
  }

  return null;
}

export function getApprovalDecisionNoteSummary(
  text: string | null | undefined,
  labels?: { approved?: string; rejected?: string; by?: string },
): string {
  const note = parseApprovalDecisionNote(text);
  if (!note) return String(text ?? '');

  const status = note.decision === 'approved'
    ? (labels?.approved ?? 'Approval approved')
    : (labels?.rejected ?? 'Approval rejected');
  const by = note.actorName ? ` ${labels?.by ?? 'by'} ${note.actorName}` : '';
  const comment = note.comment ? `: ${note.comment}` : '';
  return `${status}${by}${comment}`;
}
