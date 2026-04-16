/**
 * ConvexClientProvider – React Native version.
 *
 * Integrates @react-native-firebase Auth with Convex's ConvexProviderWithAuth.
 * The Firebase ID token (JWT) is passed to Convex which verifies it via the
 * auth.config.ts OIDC provider (same Firebase project: whagons-5).
 */
import React, { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { ConvexReactClient, ConvexProviderWithAuth } from 'convex/react';
import { getIdToken as getFirebaseIdToken } from '@react-native-firebase/auth';
import { auth } from '../firebase/firebaseConfig';

const CONVEX_URL = process.env.EXPO_PUBLIC_CONVEX_URL;
if (!CONVEX_URL) {
  throw new Error('EXPO_PUBLIC_CONVEX_URL is not set in environment variables');
}

const convex = new ConvexReactClient(CONVEX_URL);

function useFirebaseAuth() {
  const [user, setUser] = useState(auth.currentUser);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser);
      setIsLoading(false);
    });
    return unsubscribe;
  }, []);

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      if (!user) return null;
      return getFirebaseIdToken(user, forceRefreshToken);
    },
    [user],
  );

  return useMemo(
    () => ({
      isLoading,
      isAuthenticated: !!user,
      fetchAccessToken,
    }),
    [isLoading, user, fetchAccessToken],
  );
}

interface Props {
  children: ReactNode;
}

export function ConvexClientProvider({ children }: Props) {
  return (
    <ConvexProviderWithAuth client={convex} useAuth={useFirebaseAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}

export { convex };
