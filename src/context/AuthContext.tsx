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
  useMemo,
  useRef,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { getIdToken as getFirebaseIdToken } from '@react-native-firebase/auth';
import { api } from '../../../convex/_generated/api';
import {
  signInWithGoogle as fbSignInWithGoogle,
  signInWithApple as fbSignInWithApple,
  signInWithEmail as fbSignInWithEmail,
  firebaseSignOut,
  getCurrentUser,
} from '../firebase/authService';
import { getFCMToken } from '../firebase/notificationService';
import { useNetwork } from './NetworkContext';
import * as DB from '../store/database';
import { pauseMutationQueueReplay, resumeMutationQueueReplay } from '../store/mutationQueueRuntime';

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
  signInWithApple: () => Promise<void>;
  signInWithEmail: (params: { email: string; password: string }) => Promise<void>;
  selectTenant: (tenant: string, firebaseIdToken?: string) => Promise<void>;
  switchTenant: () => Promise<{ tenants: string[]; firebaseIdToken: string }>;
  logout: () => Promise<void>;
  /** Non-null when user has multiple tenants and needs to pick one */
  pendingTenants: string[] | null;
  /** Authenticated in Firebase, but not attached to any Convex tenant */
  hasNoTenants: boolean;
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const STORAGE_KEY_SUBDOMAIN = 'wh_auth_subdomain';
const STORAGE_KEY_CACHED_USER = 'wh_auth_cached_user';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function summarizeTenants(tenants: string[] | undefined | null): string {
  if (tenants === undefined) return 'loading';
  if (tenants === null) return 'null';
  return `${tenants.length} [${tenants.slice(0, 3).join(', ')}${tenants.length > 3 ? ', ...' : ''}]`;
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading: convexAuthLoading } = useConvexAuth();
  const { isOnline } = useNetwork();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isRestoringTenant, setIsRestoringTenant] = useState(true);
  const [pendingTenants, setPendingTenants] = useState<string[] | null>(null);
  const [hasNoTenants, setHasNoTenants] = useState(false);
  const [tenantResolved, setTenantResolved] = useState(false);
  const [cachedUser, setCachedUser] = useState<UserInfo | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const offlineResolvedRef = useRef(false);
  const loggingOutRef = useRef(false);
  const lastAuthDebugRef = useRef('');
  const unregisterPushToken = useMutation(api.pushNotificationHelpers.unregisterToken);
  const claimCurrentUserByEmail = useMutation(api.users.claimCurrentUserByEmail);

  // Query tenants for the authenticated user
  const myTenants = useQuery(
    api.users.myTenants,
    isAuthenticated && !isLoggingOut ? {} : 'skip',
  );

  // Query current user for the selected tenant
  const convexUser = useQuery(
    api.users.me,
    isAuthenticated && tenantId ? { tenantId } : 'skip',
  );

  // ------------------------------------------------------------------
  // Restore persisted tenant + cached user on mount
  // ------------------------------------------------------------------
  useEffect(() => {
    (async () => {
      const [stored, cachedJson] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY_SUBDOMAIN),
        AsyncStorage.getItem(STORAGE_KEY_CACHED_USER),
      ]);
      if (stored) setTenantId(stored);
      if (cachedJson) {
        try { setCachedUser(JSON.parse(cachedJson)); } catch {}
      }
      setIsRestoringTenant(false);
    })();
  }, []);

  // ------------------------------------------------------------------
  // Offline bypass: if we have a cached tenant + cached user + Firebase
  // session but Convex can't connect, resolve immediately so the app
  // doesn't hang on the splash screen.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (offlineResolvedRef.current) return;
    if (isOnline) return;
    if (isRestoringTenant) return;

    const hasFbSession = !!getCurrentUser();
    if (hasFbSession && tenantId && cachedUser && !tenantResolved) {
      console.log('[AUTH] Offline bypass: using cached auth for tenant', tenantId);
      setTenantResolved(true);
      offlineResolvedRef.current = true;
    }
  }, [isOnline, isRestoringTenant, tenantId, cachedUser, tenantResolved]);

  // ------------------------------------------------------------------
  // Auto-select tenant when myTenants loads (if no tenant selected)
  // ------------------------------------------------------------------
  useEffect(() => {
    if (isLoggingOut || loggingOutRef.current) return;
    if (tenantResolved) return;
    if (!isAuthenticated || !myTenants) {
      console.log('[AUTH] Tenant auto-select waiting:', {
        isAuthenticated,
        myTenants: summarizeTenants(myTenants),
        tenantId,
        tenantResolved,
      });
      return;
    }

    let cancelled = false;

    const resolveTenant = async () => {
      console.log('[AUTH] Tenant auto-select evaluating:', {
        tenantId,
        myTenants: summarizeTenants(myTenants),
      });

      if (tenantId && myTenants.includes(tenantId)) {
        console.log('[AUTH] Existing tenant accepted:', tenantId);
        await claimCurrentUserByEmail({ tenantId }).catch((err) => {
          console.warn('[AUTH] Existing tenant email claim failed:', err);
        });
        if (cancelled) return;
        setTenantResolved(true);
        return;
      }

      if (tenantId && !myTenants.includes(tenantId)) {
        console.log('[AUTH] Stored tenant not available, clearing:', tenantId);
        setTenantId(null);
        setCachedUser(null);
        AsyncStorage.removeItem(STORAGE_KEY_SUBDOMAIN).catch(() => {});
        AsyncStorage.removeItem(STORAGE_KEY_CACHED_USER).catch(() => {});
      }

      if (myTenants.length === 0) {
        console.warn('[AUTH] Authenticated Firebase user has no Convex tenants');
        setPendingTenants(null);
        setHasNoTenants(true);
        setTenantResolved(true);
      } else if (myTenants.length === 1) {
        const t = myTenants[0];
        console.log('[AUTH] Single tenant auto-selected:', t);
        await claimCurrentUserByEmail({ tenantId: t }).catch((err) => {
          console.warn('[AUTH] Single tenant email claim failed:', err);
        });
        if (cancelled) return;
        setTenantId(t);
        setPendingTenants(null);
        setHasNoTenants(false);
        AsyncStorage.setItem(STORAGE_KEY_SUBDOMAIN, t);
        setTenantResolved(true);
      } else {
        console.log('[AUTH] Multiple tenants require selection:', summarizeTenants(myTenants));
        setPendingTenants(myTenants);
        setHasNoTenants(false);
        setTenantResolved(true);
      }
    };

    void resolveTenant();

    return () => {
      cancelled = true;
    };
  }, [claimCurrentUserByEmail, isAuthenticated, isLoggingOut, myTenants, tenantId, tenantResolved]);

  useEffect(() => {
    if (!isAuthenticated && loggingOutRef.current) {
      loggingOutRef.current = false;
      setIsLoggingOut(false);
    }
  }, [isAuthenticated, isLoggingOut]);

  // If the selected tenant has no active user record anymore, clear it so the
  // app returns to tenant selection instead of loading stale cached state.
  useEffect(() => {
    if (!isAuthenticated || !tenantId) return;
    if (!isOnline) return;
    if (convexUser !== null) return;

    setTenantId(null);
    setTenantResolved(false);
    setCachedUser(null);
    AsyncStorage.removeItem(STORAGE_KEY_SUBDOMAIN).catch(() => {});
    AsyncStorage.removeItem(STORAGE_KEY_CACHED_USER).catch(() => {});
  }, [isAuthenticated, tenantId, convexUser, isOnline]);

  // ------------------------------------------------------------------
  // Map Convex user → UserInfo + cache to AsyncStorage
  // ------------------------------------------------------------------
  const user: UserInfo | null = useMemo(() => {
    if (!convexUser) return null;
    return {
      id: (convexUser as any).pgId ?? (convexUser as any)._id ?? 0,
      name: (convexUser as any).name ?? '',
      email: (convexUser as any).email ?? '',
      apodo: (convexUser as any).apodo ?? '',
      showApodo: Boolean((convexUser as any).showApodo),
      photo_url: (convexUser as any).urlPicture ?? getCurrentUser()?.photoURL ?? null,
      tenant_domain_prefix: tenantId,
    };
  }, [convexUser, tenantId]);

  // Persist user to AsyncStorage whenever Convex returns fresh data
  useEffect(() => {
    if (user) {
      AsyncStorage.setItem(STORAGE_KEY_CACHED_USER, JSON.stringify(user)).catch(() => {});
      setCachedUser(user);
    }
  }, [user]);

  useEffect(() => {
    if (isAuthenticated && tenantId) {
      resumeMutationQueueReplay();
    }
  }, [isAuthenticated, tenantId]);

  // Use the live Convex user when available, otherwise the cached version
  const effectiveUser = isLoggingOut ? null : (user ?? cachedUser);

  // ------------------------------------------------------------------
  // Derived auth state — offline-aware
  // ------------------------------------------------------------------
  const offlineWithCache = !isLoggingOut && !isOnline && !!tenantId && !!cachedUser && !!getCurrentUser();

  const isLoading = isLoggingOut
    ? false
    : offlineWithCache
      ? (isRestoringTenant)
      : (
          convexAuthLoading ||
          isRestoringTenant ||
          (isAuthenticated && !myTenants) ||
          (isAuthenticated && myTenants && !tenantResolved) ||
          (isAuthenticated && !!tenantId && convexUser === undefined)
        );

  const hasActiveTenantUser = !!convexUser || offlineWithCache;
  const token = isLoggingOut
    ? null
    : offlineWithCache
    ? 'offline-cached'
    : (isAuthenticated && tenantId && hasActiveTenantUser ? 'convex-authenticated' : null);

  const state: AuthState = {
    isLoading,
    token,
    subdomain: tenantId,
    user: effectiveUser,
  };

  useEffect(() => {
    const snapshot = JSON.stringify({
      convexAuthLoading,
      isAuthenticated,
      isOnline,
      isRestoringTenant,
      isLoggingOut,
      tenantId,
      tenantResolved,
      myTenants: summarizeTenants(myTenants),
      convexUser: convexUser === undefined ? 'loading' : convexUser === null ? 'null' : 'present',
      cachedUser: cachedUser ? 'present' : 'null',
      token,
      pendingTenants: summarizeTenants(pendingTenants),
      hasNoTenants,
      isLoading,
    });
    if (snapshot === lastAuthDebugRef.current) return;
    lastAuthDebugRef.current = snapshot;
    console.log('[AUTH] State snapshot:', JSON.parse(snapshot));
  }, [cachedUser, convexAuthLoading, convexUser, hasNoTenants, isAuthenticated, isLoading, isLoggingOut, isOnline, isRestoringTenant, myTenants, pendingTenants, tenantId, tenantResolved, token]);

  // ------------------------------------------------------------------
  // Google Sign-In
  // ------------------------------------------------------------------
  const signInWithGoogle = useCallback(async () => {
    console.log('[AUTH] Google sign-in requested');
    loggingOutRef.current = false;
    setIsLoggingOut(false);
    setPendingTenants(null);
    setHasNoTenants(false);
    setTenantResolved(false);
    await fbSignInWithGoogle();
    console.log('[AUTH] Google sign-in returned from Firebase');
    // ConvexProviderWithAuth picks up the Firebase user automatically
  }, []);

  // ------------------------------------------------------------------
  // Apple Sign-In
  // ------------------------------------------------------------------
  const signInWithApple = useCallback(async () => {
    console.log('[AUTH] Apple sign-in requested');
    loggingOutRef.current = false;
    setIsLoggingOut(false);
    setPendingTenants(null);
    setHasNoTenants(false);
    setTenantResolved(false);
    await fbSignInWithApple();
    console.log('[AUTH] Apple sign-in returned from Firebase');
    // ConvexProviderWithAuth picks up the Firebase user automatically
  }, []);

  // ------------------------------------------------------------------
  // Email / Password Sign-In
  // ------------------------------------------------------------------
  const signInWithEmail = useCallback(
    async ({ email, password }: { email: string; password: string }) => {
      console.log('[AUTH] Email sign-in requested:', `${email.slice(0, 2)}***@${email.split('@')[1] ?? 'unknown'}`);
      loggingOutRef.current = false;
      setIsLoggingOut(false);
      setPendingTenants(null);
      setHasNoTenants(false);
      setTenantResolved(false);
      await fbSignInWithEmail(email, password);
      console.log('[AUTH] Email sign-in returned from Firebase');
      // ConvexProviderWithAuth picks up the Firebase user automatically
    },
    [],
  );

  const unregisterCurrentPushToken = useCallback(async (tenant: string | null) => {
    if (!tenant) return;

    try {
      const fcmToken = await getFCMToken();
      if (fcmToken) {
        await unregisterPushToken({ tenantId: tenant, fcmToken });
      }
    } catch {
      // Logout and tenant switching should not be blocked by push cleanup.
    }
  }, [unregisterPushToken]);

  // ------------------------------------------------------------------
  // Logout
  // ------------------------------------------------------------------
  const logout = useCallback(async () => {
    const tenantToLogout = tenantId;
    loggingOutRef.current = true;
    setIsLoggingOut(true);
    setPendingTenants(null);
    setHasNoTenants(false);
    pauseMutationQueueReplay();

    await unregisterCurrentPushToken(tenantToLogout);

    setTenantId(null);
    setTenantResolved(false);
    setPendingTenants(null);
    setHasNoTenants(false);
    setCachedUser(null);
    offlineResolvedRef.current = false;

    try {
      await firebaseSignOut();
    } catch {}

    await Promise.allSettled([
      AsyncStorage.removeItem(STORAGE_KEY_SUBDOMAIN),
      AsyncStorage.removeItem(STORAGE_KEY_CACHED_USER),
      DB.clearMutationQueue(tenantToLogout ?? undefined),
    ]);
  }, [tenantId, unregisterCurrentPushToken]);

  // ------------------------------------------------------------------
  // Select a specific tenant
  // ------------------------------------------------------------------
  const selectTenant = useCallback(
    async (tenant: string) => {
      console.log('[AUTH] Selecting tenant:', tenant);
      const claimResult = await claimCurrentUserByEmail({ tenantId: tenant }).catch((err) => {
        console.warn('[AUTH] Tenant email claim failed:', err);
        return null;
      });
      console.log('[AUTH] Tenant email claim result:', claimResult);
      resumeMutationQueueReplay();
      setTenantId(tenant);
      setPendingTenants(null);
      setHasNoTenants(false);
      await AsyncStorage.setItem(STORAGE_KEY_SUBDOMAIN, tenant);
      setTenantResolved(true);
    },
    [claimCurrentUserByEmail],
  );

  // ------------------------------------------------------------------
  // Switch tenant
  // ------------------------------------------------------------------
  const switchTenant = useCallback(async (): Promise<{
    tenants: string[];
    firebaseIdToken: string;
  }> => {
    const tenantToSwitchFrom = tenantId;
    pauseMutationQueueReplay();

    try {
      await unregisterCurrentPushToken(tenantToSwitchFrom);
      await DB.clearMutationQueue(tenantToSwitchFrom ?? undefined).catch(() => {});
      await AsyncStorage.removeItem(STORAGE_KEY_SUBDOMAIN);
      setTenantId(null);
      setTenantResolved(false);

      const fbUser = getCurrentUser();
      if (!fbUser) throw new Error('Not signed in');
      const firebaseIdToken = await getFirebaseIdToken(fbUser, true);

      if (!myTenants || myTenants.length === 0) {
        throw new Error('No workspaces found for your account');
      }

      return { tenants: myTenants, firebaseIdToken };
    } catch (error) {
      resumeMutationQueueReplay();
      throw error;
    }
  }, [myTenants, tenantId, unregisterCurrentPushToken]);

  const contextValue = useMemo(() => ({
    ...state,
    signInWithGoogle,
    signInWithApple,
    signInWithEmail,
    selectTenant,
    switchTenant,
    logout,
    pendingTenants: isLoggingOut ? null : pendingTenants,
    hasNoTenants: !isLoggingOut && hasNoTenants,
  }), [state.isLoading, state.token, state.subdomain, state.user, signInWithGoogle, signInWithApple, signInWithEmail, selectTenant, switchTenant, logout, isLoggingOut, pendingTenants, hasNoTenants]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
