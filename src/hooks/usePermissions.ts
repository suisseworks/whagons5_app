import { useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useTenant } from './useTenant';

export function usePermissions() {
  const { tenantId } = useTenant();
  const permissions = useQuery(
    api.users.myPermissions,
    tenantId ? { tenantId } : 'skip',
  );

  const permissionSet = useMemo(() => new Set(permissions ?? []), [permissions]);

  return {
    permissions: permissions ?? [],
    isLoading: permissions === undefined,
    hasPermission: (permissionName: string) => permissionSet.has(permissionName),
  };
}

export function usePermission(permissionName: string): boolean {
  const { hasPermission } = usePermissions();
  return hasPermission(permissionName);
}
