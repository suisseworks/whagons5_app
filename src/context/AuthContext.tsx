/**
 * AuthContext – Manages authentication state for the mobile app.
 *
 * Pure Convex + Firebase auth flow:
 *   1. Firebase sign-in (Google native or email/password)
 *   2. Convex auto-authenticates via ConvexProviderWithAuth (Firebase JWT)
 *   3. Query users.myTenants to discover available tenants
 *   4. Query users.me(tenantId) for current user data
 *   5. tenantId persisted in AsyncStorage
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useConvexAuth, useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  signInWithGoogle as fbSignInWithGoogle,
  signInWithEmail as fbSignInWithEmail,
  firebaseSignOut,
  getCurrentUser,
} from '../firebase/authService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserInfo {
  id: string | number;
  name: string;
  email: string;
  photo_url?: string | null;
  tenant_domain_prefix?: string | null;
  [key: string]: unknown;
}

interface AuthState {
  /** Whether we've finished loading persisted credentials */
  isLoading: boolean;
  /** Auth token — set to a truthy placeholder when authenticated via Convex */
  token: string | null;
  /** Tenant ID (e.g. "calaluna", "whagons-qeriwt5ju8") */
  subdomain: string | null;
  /** Current user info */
  user: UserInfo | null;
}

/** Thrown when the user has multiple tenants and must pick one. */
export class TenantChoiceRequired extends Error {
  tenants: string[];
  firebaseIdToken: string;
  constructor(tenants: string[], firebaseIdToken: string) {
    super('Multiple tenants available');
    this.name = 'TenantChoiceRequired';
    this.tenants = tenants;
    this.firebaseIdToken = firebaseIdToken;
  }
}

interface AuthContextType extends AuthState {
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (params: { email: string; password: string }) => Promise<void>;
  selectTenant: (tenant: string, firebaseIdToken: string) => Promise<void>;
  switchTenant: () => Promise<{ tenants: string[]; firebaseIdToken: string }>;
  logout: () => Promise<void>;
  /** Non-null when user has multiple tenants and needs to pick one */
  pendingTenants: string[] | null;
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const STORAGE_KEY_SUBDOMAIN = 'wh_auth_subdomain';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading: convexAuthLoading } = useConvexAuth();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isRestoringTenant, setIsRestoringTenant] = useState(true);
  const [pendingTenants, setPendingTenants] = useState<string[] | null>(null);
  const [tenantResolved, setTenantResolved] = useState(false);

  // Query tenants for the authenticated user
  const myTenants = useQuery(
    api.users.myTenants,
    isAuthenticated ? {} : 'skip',
  );

  // Query current user for the selected tenant
  const convexUser = useQuery(
    api.users.me,
    isAuthenticated && tenantId ? { tenantId } : 'skip',
  );

  // ------------------------------------------------------------------
  // Restore persisted tenant on mount
  // ------------------------------------------------------------------
  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem(STORAGE_KEY_SUBDOMAIN);
      if (stored) setTenantId(stored);
      setIsRestoringTenant(false);
    })();
  }, []);

  // ------------------------------------------------------------------
  // Auto-select tenant when myTenants loads (if no tenant selected)
  // ------------------------------------------------------------------
  useEffect(() => {
    console.log('[AUTH] State:', { isAuthenticated, myTenants, tenantId, tenantResolved, isRestoringTenant, convexAuthLoading });
    if (tenantResolved) return;
    if (!isAuthenticated || !myTenants) return;

    if (tenantId && myTenants.includes(tenantId)) {
      // Already have a valid tenant
      setTenantResolved(true);
      return;
    }

    if (myTenants.length === 0) {
      // No tenants — user not associated with any company
      console.log('[AUTH] No tenants found for user');
      setTenantResolved(true);
    } else if (myTenants.length === 1) {
      // Single tenant — auto-select
      const t = myTenants[0];
      setTenantId(t);
      AsyncStorage.setItem(STORAGE_KEY_SUBDOMAIN, t);
      setTenantResolved(true);
    } else {
      // Multiple tenants, none selected
      setPendingTenants(myTenants);
      setTenantResolved(true);
    }
  }, [isAuthenticated, myTenants, tenantId, tenantResolved]);

  // ------------------------------------------------------------------
  // Map Convex user → UserInfo
  // ------------------------------------------------------------------
  const user: UserInfo | null = convexUser
    ? {
        id: (convexUser as any).pgId ?? (convexUser as any)._id ?? 0,
        name: (convexUser as any).name ?? '',
        email: (convexUser as any).email ?? '',
        photo_url: (convexUser as any).urlPicture ?? getCurrentUser()?.photoURL ?? null,
        tenant_domain_prefix: tenantId,
      }
    : null;

  // ------------------------------------------------------------------
  // Derived auth state
  // ------------------------------------------------------------------
  // Stay loading until:
  // 1. Convex auth is resolved
  // 2. AsyncStorage tenant is restored
  // 3. Tenant list is fetched (if authenticated)
  // 4. Tenant is auto-selected or pendingTenants is set
  const isLoading =
    convexAuthLoading ||
    isRestoringTenant ||
    (isAuthenticated && !myTenants) ||
    (isAuthenticated && myTenants && !tenantResolved);

  const state: AuthState = {
    isLoading,
    token: isAuthenticated && tenantId ? 'convex-authenticated' : null,
    subdomain: tenantId,
    user,
  };

  // ------------------------------------------------------------------
  // Google Sign-In
  // ------------------------------------------------------------------
  const signInWithGoogle = useCallback(async () => {
    await fbSignInWithGoogle();
    // ConvexProviderWithAuth picks up the Firebase user automatically
  }, []);

  // ------------------------------------------------------------------
  // Email / Password Sign-In
  // ------------------------------------------------------------------
  const signInWithEmail = useCallback(
    async ({ email, password }: { email: string; password: string }) => {
      await fbSignInWithEmail(email, password);
      // ConvexProviderWithAuth picks up the Firebase user automatically
    },
    [],
  );

  // ------------------------------------------------------------------
  // Logout
  // ------------------------------------------------------------------
  const logout = useCallback(async () => {
    try {
      await firebaseSignOut();
    } catch {}

    await AsyncStorage.removeItem(STORAGE_KEY_SUBDOMAIN);
    setTenantId(null);
    setTenantResolved(false);
  }, []);

  // ------------------------------------------------------------------
  // Select a specific tenant
  // ------------------------------------------------------------------
  const selectTenant = useCallback(
    async (tenant: string) => {
      setTenantId(tenant);
      setPendingTenants(null);
      await AsyncStorage.setItem(STORAGE_KEY_SUBDOMAIN, tenant);
      setTenantResolved(true);
    },
    [],
  );

  // ------------------------------------------------------------------
  // Switch tenant
  // ------------------------------------------------------------------
  const switchTenant = useCallback(async (): Promise<{
    tenants: string[];
    firebaseIdToken: string;
  }> => {
    await AsyncStorage.removeItem(STORAGE_KEY_SUBDOMAIN);
    setTenantId(null);
    setTenantResolved(false);

    const fbUser = getCurrentUser();
    if (!fbUser) throw new Error('Not signed in');
    const firebaseIdToken = await fbUser.getIdToken(true);

    if (!myTenants || myTenants.length === 0) {
      throw new Error('No workspaces found for your account');
    }

    return { tenants: myTenants, firebaseIdToken };
  }, [myTenants]);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        signInWithGoogle,
        signInWithEmail,
        selectTenant,
        switchTenant,
        logout,
        pendingTenants,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
