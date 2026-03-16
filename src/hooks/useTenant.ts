/**
 * useTenant – Mobile version of the tenant context hook.
 *
 * On web, the tenant is derived from the URL subdomain.
 * On mobile, the tenant comes from AuthContext's `subdomain` value
 * which is resolved during login.
 *
 * Usage:
 * ```tsx
 * const { tenantId } = useTenant();
 * const tasks = useQuery(api.tasks.list, tenantId ? { tenantId } : "skip");
 * ```
 */
import { useAuth } from '../context/AuthContext';

export interface TenantInfo {
  /** The tenant domain prefix (e.g., "acme"), or null if not logged in */
  tenantId: string | null;
  /** Whether we're on the landlord level (no tenant selected) */
  isLandlord: boolean;
}

export function useTenant(): TenantInfo {
  const { subdomain } = useAuth();
  return {
    tenantId: subdomain ?? null,
    isLandlord: !subdomain,
  };
}
