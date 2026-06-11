export type NfcActionKind = 'task_session_toggle' | 'linked_task_status' | 'open_url';
export type NfcLinkedAction = 'open_task' | 'start_task' | 'complete_task';
export type NfcExecutionMode = 'direct' | 'confirm';

export function getNfcBaseDomain(): string {
  const explicit = process.env.EXPO_PUBLIC_NFC_BASE_DOMAIN?.trim();
  const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL?.trim() ?? '';
  const inferred = convexUrl.includes('-dev') || convexUrl.includes('dev.')
    ? 'dev.whagons.com'
    : 'app.whagons.com';
  return (explicit || inferred)
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
}

export function getNfcBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_NFC_BASE_URL?.trim();
  const shareBaseUrl = process.env.EXPO_PUBLIC_TASK_SHARE_BASE_URL?.trim();
  if (explicit) return explicit;
  if (shareBaseUrl) return shareBaseUrl;
  return `https://${getNfcBaseDomain()}`;
}

export function getNfcTapUrl(uuid: string, tenantId?: string | null, baseUrl = getNfcBaseUrl()): string {
  const normalizedTenant = tenantId?.trim();

  try {
    const url = new URL('/nfc/tap', baseUrl);
    url.searchParams.set('uuid', uuid);
    if (normalizedTenant) url.searchParams.set('tenantId', normalizedTenant);
    return url.toString();
  } catch {
    const normalizedBase = baseUrl.replace(/\/+$/, '');
    const query = new URLSearchParams();
    query.set('uuid', uuid);
    if (normalizedTenant) query.set('tenantId', normalizedTenant);
    return `${normalizedBase}/nfc/tap?${query.toString()}`;
  }
}

export function getNfcActionLabel(kind?: string): string {
  if (kind === 'task_session_toggle') return 'Create task';
  if (kind === 'linked_task_status') return 'Existing task action';
  if (kind === 'open_url') return 'Open URL';
  return 'NFC action';
}

export function getNfcLinkedActionLabel(action?: string): string {
  if (action === 'open_task') return 'Open task';
  if (action === 'start_task') return 'Start task';
  if (action === 'complete_task') return 'Complete task';
  return 'Task action';
}
