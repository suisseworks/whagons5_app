export interface InvitationQrPayload {
  tenantId: string;
  invitationToken: string;
  sourceUrl?: string;
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  return values.find((value) => value?.trim())?.trim() ?? null;
}

function tenantFromHost(hostname: string) {
  const parts = hostname.split('.').filter(Boolean);
  if (parts.length < 2) return null;

  const prefix = parts[0]?.trim();
  if (!prefix || prefix === 'app' || prefix === 'www' || prefix === 'localhost' || prefix === '127') {
    return null;
  }

  if (hostname === 'whagons5.whagons.com') {
    return null;
  }

  return prefix;
}

export function parseInvitationQrPayload(rawValue: string): InvitationQrPayload | null {
  const raw = rawValue.trim();
  if (!raw) return null;

  try {
    const parsedJson = JSON.parse(raw);
    const tenantId = firstNonEmpty(parsedJson?.tenantId, parsedJson?.tenant, parsedJson?.tenantDomainPrefix);
    const invitationToken = firstNonEmpty(parsedJson?.invitationToken, parsedJson?.token);
    if (tenantId && invitationToken) {
      return { tenantId, invitationToken, sourceUrl: raw };
    }
  } catch {
    // Most QR codes are URLs, not JSON payloads.
  }

  try {
    const url = new URL(raw);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const isCustomInviteUrl = url.protocol === 'whagons:' && url.hostname.toLowerCase() === 'invite';
    const invitationIndex = pathParts.findIndex((part) => part.toLowerCase() === 'invitation');
    const inviteIndex = pathParts.findIndex((part) => part.toLowerCase() === 'invite');
    const tokenFromPath =
      isCustomInviteUrl ? pathParts[0] :
      invitationIndex >= 0 ? pathParts[invitationIndex + 1] :
      inviteIndex >= 0 ? pathParts[inviteIndex + 1] :
      null;
    const invitationToken = firstNonEmpty(
      url.searchParams.get('invitationToken'),
      url.searchParams.get('token'),
      tokenFromPath ? decodeURIComponent(tokenFromPath) : null,
    );
    const tenantId = firstNonEmpty(
      url.searchParams.get('tenantId'),
      url.searchParams.get('tenant'),
      url.searchParams.get('tenantDomainPrefix'),
      tenantFromHost(url.hostname),
    );

    if (tenantId && invitationToken) {
      return { tenantId, invitationToken, sourceUrl: raw };
    }
  } catch {
    // Not a URL.
  }

  return null;
}

export function formatTenantName(tenantId: string): string {
  return tenantId
    .split('.')[0]
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
