/**
 * Firebase configuration for the Whagons React Native app.
 *
 * Uses @react-native-firebase modular API (v22+).
 * Reads config from native google-services.json / GoogleService-Info.plist.
 *
 * Same Firebase project as the web client: whagons-5
 */

import { getApp } from '@react-native-firebase/app';
import { getAuth } from '@react-native-firebase/auth';

const app = getApp();
const auth = getAuth(app);

export { app, auth };

/**
 * Get the currently signed-in Firebase user, or null.
 */
export function currentFirebaseUser() {
  return auth.currentUser;
}

/**
 * Get a fresh Firebase ID token for the current user.
 * Returns null if no user is signed in.
 */
export async function getIdToken(forceRefresh = false): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken(forceRefresh);
}
