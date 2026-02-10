/**
 * API configuration for the Whagons mobile app.
 *
 * Reads from EXPO_PUBLIC_* environment variables set in .env files.
 * The subdomain is the tenant identifier (e.g. "mycompany").
 */

const PROTOCOL = process.env.EXPO_PUBLIC_API_PROTOCOL ?? (__DEV__ ? 'http' : 'https');
const HOST = process.env.EXPO_PUBLIC_API_URL ?? (__DEV__ ? '10.0.2.2:8000' : 'api.whagons.com');

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
} as const;

/**
 * Build a full API base URL for the given tenant subdomain.
 * Example: buildBaseUrl('mycompany') → "http://mycompany.10.0.2.2:8000/api"
 * Example: buildBaseUrl()            → "http://10.0.2.2:8000/api"  (landlord)
 */
export function buildBaseUrl(subdomain?: string): string {
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
