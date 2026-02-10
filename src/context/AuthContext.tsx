/**
 * AuthContext – Manages authentication state for the mobile app.
 *
 * Mirrors the web client's auth flow:
 *   1. Firebase sign-in (Google native or email/password) → Firebase idToken
 *   2. POST /login { token: idToken } to the LANDLORD (no subdomain)
 *      - If 225 → tenant found → extract subdomain → retry /login WITH subdomain
 *      - If 200 → user has no tenant → show "no company found" message
 *   3. Bearer token + subdomain persisted in AsyncStorage
 *   4. GET /users/me → user data + tenant_domain_prefix confirmation
 *
 * The user never has to type a subdomain — it's auto-detected.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildBaseUrl, buildLandlordUrl } from '../config/api';
import {
  signInWithGoogle as fbSignInWithGoogle,
  signInWithEmail as fbSignInWithEmail,
  firebaseSignOut,
  onAuthStateChanged,
} from '../firebase/authService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserInfo {
  id: number;
  name: string;
  email: string;
  tenant_domain_prefix?: string | null;
  [key: string]: unknown;
}

interface AuthState {
  /** Whether we've finished loading persisted credentials */
  isLoading: boolean;
  /** The Sanctum bearer token (null = logged out) */
  token: string | null;
  /** Tenant subdomain (auto-detected, not user-entered) */
  subdomain: string | null;
  /** Current user info */
  user: UserInfo | null;
}

interface AuthContextType extends AuthState {
  /** Sign in with Google (native). Subdomain is auto-detected. */
  signInWithGoogle: () => Promise<void>;

  /** Sign in with email + password via Firebase. Subdomain is auto-detected. */
  signInWithEmail: (params: {
    email: string;
    password: string;
  }) => Promise<void>;

  /** Clear all auth state, Firebase sign-out, and local data. */
  logout: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const STORAGE_KEY_TOKEN = 'wh_auth_token';
const STORAGE_KEY_SUBDOMAIN = 'wh_auth_subdomain';
const STORAGE_KEY_USER = 'wh_auth_user';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    isLoading: true,
    token: null,
    subdomain: null,
    user: null,
  });

  // Prevent double-login race
  const loginInProgress = useRef(false);

  // ------------------------------------------------------------------
  // Restore persisted session on mount
  // ------------------------------------------------------------------
  useEffect(() => {
    (async () => {
      try {
        const [token, subdomain, userJson] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_TOKEN),
          AsyncStorage.getItem(STORAGE_KEY_SUBDOMAIN),
          AsyncStorage.getItem(STORAGE_KEY_USER),
        ]);
        const user = userJson ? JSON.parse(userJson) : null;
        setState({ isLoading: false, token, subdomain, user });
      } catch {
        setState((s) => ({ ...s, isLoading: false }));
      }
    })();
  }, []);

  // ------------------------------------------------------------------
  // Listen for Firebase auth state changes.
  // If a Firebase user exists but we have no Sanctum token,
  // try to re-login automatically using the stored subdomain.
  // ------------------------------------------------------------------
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(async (firebaseUser) => {
      if (!firebaseUser) return;
      if (state.token) return;

      try {
        const subdomain = await AsyncStorage.getItem(STORAGE_KEY_SUBDOMAIN);
        if (!subdomain) return;

        const idToken = await firebaseUser.getIdToken();
        await backendLogin(idToken);
      } catch {
        // Silent – user will see the login screen
      }
    });
    return unsubscribe;
  }, [state.token]);

  // ------------------------------------------------------------------
  // Backend login – mirrors web client's flow:
  //   1. POST /login to landlord (no subdomain)
  //   2. If 225 → extract tenant subdomain → retry with subdomain
  //   3. If 200 on landlord → user exists but has no tenant
  // ------------------------------------------------------------------
  const backendLogin = async (firebaseIdToken: string) => {
    if (loginInProgress.current) return;
    loginInProgress.current = true;

    try {
      // Step 1: POST to landlord
      const landlordUrl = buildLandlordUrl();
      const resp = await fetch(`${landlordUrl}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ token: firebaseIdToken }),
      });

      // Step 2: Handle 225 – tenant redirect
      if (resp.status === 225) {
        const data = await resp.json();
        const tenant: string = data.tenant; // e.g. "mycompany.localhost:8000"
        if (!tenant) throw new Error('No tenant in 225 response');

        // Extract subdomain prefix (everything before the first dot)
        const domainPrefix = tenant.split('.')[0];

        // Retry login on the tenant subdomain
        const tenantUrl = buildBaseUrl(domainPrefix);
        const tenantResp = await fetch(`${tenantUrl}/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ token: firebaseIdToken }),
        });

        if (!tenantResp.ok) {
          const body = await tenantResp.text();
          throw new Error(`Tenant login failed (${tenantResp.status}): ${body}`);
        }

        const tenantData = await tenantResp.json();
        const token: string =
          tenantData.token ?? tenantData.access_token ?? tenantData.data?.token;
        if (!token) throw new Error('No token in tenant login response');

        // Fetch user info
        const user = await fetchUserInfo(domainPrefix, token);

        // Persist
        await Promise.all([
          AsyncStorage.setItem(STORAGE_KEY_TOKEN, token),
          AsyncStorage.setItem(STORAGE_KEY_SUBDOMAIN, domainPrefix),
          AsyncStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user)),
        ]);

        setState({ isLoading: false, token, subdomain: domainPrefix, user });
        return;
      }

      // Step 3: Handle 200 on landlord – user exists but may not have a tenant
      if (resp.ok) {
        const data = await resp.json();
        const token: string =
          data.token ?? data.access_token ?? data.data?.token;

        if (!token) {
          throw new Error(
            'Your account is not associated with any company. Please contact your administrator.',
          );
        }

        // We got a landlord token, but the user doesn't have a tenant.
        // This means they're a new user without a company.
        throw new Error(
          'Your account is not associated with any company. Please contact your administrator.',
        );
      }

      // Any other error
      const body = await resp.text();
      throw new Error(`Login failed (${resp.status}): ${body}`);
    } finally {
      loginInProgress.current = false;
    }
  };

  // ------------------------------------------------------------------
  // Fetch /users/me to get full user info + tenant confirmation
  // ------------------------------------------------------------------
  const fetchUserInfo = async (
    subdomain: string,
    token: string,
  ): Promise<UserInfo> => {
    const baseUrl = buildBaseUrl(subdomain);
    const resp = await fetch(`${baseUrl}/users/me`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (!resp.ok) {
      // Non-critical: return minimal user info
      return { id: 0, name: '', email: '' };
    }

    const json = await resp.json();
    // The response may be wrapped in { data: { ... } }
    return json.data ?? json;
  };

  // ------------------------------------------------------------------
  // Google Sign-In — subdomain auto-detected
  // ------------------------------------------------------------------
  const signInWithGoogle = useCallback(async () => {
    // 1. Native Google sign-in → Firebase credential
    const userCredential = await fbSignInWithGoogle();

    // 2. Get the Firebase idToken
    const idToken = await userCredential.user.getIdToken();

    // 3. Exchange with backend (landlord first, then tenant redirect)
    await backendLogin(idToken);
  }, []);

  // ------------------------------------------------------------------
  // Email / Password Sign-In — subdomain auto-detected
  // ------------------------------------------------------------------
  const signInWithEmail = useCallback(
    async ({ email, password }: { email: string; password: string }) => {
      // 1. Firebase email/password sign-in
      const userCredential = await fbSignInWithEmail(email, password);

      // 2. Get the Firebase idToken
      const idToken = await userCredential.user.getIdToken();

      // 3. Exchange with backend (landlord first, then tenant redirect)
      await backendLogin(idToken);
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

    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEY_TOKEN),
      AsyncStorage.removeItem(STORAGE_KEY_SUBDOMAIN),
      AsyncStorage.removeItem(STORAGE_KEY_USER),
    ]);

    setState({ isLoading: false, token: null, subdomain: null, user: null });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        signInWithGoogle,
        signInWithEmail,
        logout,
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
