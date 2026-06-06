export type NfcActionKind = 'task_session_toggle' | 'linked_task_status' | 'open_url';
export type NfcLinkedAction = 'open_task' | 'start_task' | 'complete_task';
export type NfcExecutionMode = 'direct' | 'confirm';

export function getNfcBaseDomain(): string {
  return (process.env.EXPO_PUBLIC_NFC_BASE_DOMAIN?.trim() || 'whagons.com')
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
}

export function getNfcTapUrl(uuid: string, tenantId?: string | null, baseDomain = getNfcBaseDomain()): string {
  const safeUuid = encodeURIComponent(uuid);
  const normalizedBase = baseDomain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const normalizedTenant = tenantId?.trim();
  const host = normalizedTenant ? `${normalizedTenant}.${normalizedBase}` : `app.${normalizedBase}`;
  return `https://${host}/nfc/tap/${safeUuid}`;
}

export function getNfcActionLabel(kind?: string): string {
  if (kind === 'task_session_toggle') return 'Start/end task';
  if (kind === 'linked_task_status') return 'Linked task status';
  if (kind === 'open_url') return 'Open URL';
  return 'NFC action';
}

export function getNfcLinkedActionLabel(action?: string): string {
  if (action === 'open_task') return 'Open task';
  if (action === 'start_task') return 'Start task';
  if (action === 'complete_task') return 'Complete task';
  return 'Task action';
}
