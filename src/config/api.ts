/**
 * API configuration for the Whagons mobile app.
 *
 * Reads from EXPO_PUBLIC_* environment variables set in .env files.
 * The subdomain is the tenant identifier (e.g. "mycompany").
 *
 * DEV NOTE: Subdomain-based URLs (e.g. tenant.10.0.2.2) don't work on
 * Android emulators because wildcard subdomains on IP addresses can't be
 * resolved by DNS. In dev mode when the host is an IP address, we skip
 * the subdomain in the URL and instead pass an X-Tenant header so the
 * backend can resolve the tenant without relying on the Host header.
 */

const PROTOCOL = process.env.EXPO_PUBLIC_API_PROTOCOL ?? (__DEV__ ? 'http' : 'https');
const HOST = process.env.EXPO_PUBLIC_API_URL ?? (__DEV__ ? '10.0.2.2:8000' : 'api.whagons.com');

/** True when the host is an IP address (subdomain URLs won't resolve). */
const IS_IP_HOST = /^\d+\.\d+\.\d+\.\d+(:\d+)?$/.test(HOST);

export const API_CONFIG = {
  /** Protocol used for API requests */
  protocol: PROTOCOL,

  /**
   * The host (without protocol) where the API lives.
   * Comes from EXPO_PUBLIC_API_URL in .env
   */
  host: HOST,

  /** Default timeout for non-streaming requests (ms) */
  timeout: 30_000,

  /** Timeout for the NDJSON sync stream (ms) */
  syncStreamTimeout: 120_000,

  /**
   * When true, subdomain-based URLs can't work (IP host in dev).
   * Callers should use getTenantHeaders() to pass the tenant via header.
   */
  useHeaderTenant: __DEV__ && IS_IP_HOST,
} as const;

/**
 * Build a full API base URL for the given tenant subdomain.
 *
 * Production:       "https://mycompany.api.whagons.com/api"
 * Dev (localhost):  "http://mycompany.localhost:8000/api"
 * Dev (IP host):    "http://10.0.2.2:8000/api"  (tenant via X-Tenant header)
 */
export function buildBaseUrl(subdomain?: string): string {
  if (API_CONFIG.useHeaderTenant) {
    return `${API_CONFIG.protocol}://${API_CONFIG.host}/api`;
  }
  const sub = subdomain ? `${subdomain}.` : '';
  return `${API_CONFIG.protocol}://${sub}${API_CONFIG.host}/api`;
}

/**
 * Build the landlord (non-tenant) API base URL.
 * Used for the initial /login call before we know the subdomain.
 */
export function buildLandlordUrl(): string {
  return `${API_CONFIG.protocol}://${API_CONFIG.host}/api`;
}

/**
 * Returns extra headers needed to identify the tenant when subdomain-based
 * routing is unavailable (dev on IP host). Returns {} in production or
 * when no subdomain is provided.
 */
export function getTenantHeaders(subdomain?: string): Record<string, string> {
  if (API_CONFIG.useHeaderTenant && subdomain) {
    return { 'X-Tenant': subdomain };
  }
  return {};
}
