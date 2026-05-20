/**
 * Auth service – wraps Firebase Auth + Google Sign-In for the mobile app.
 *
 * Uses @react-native-firebase modular API (v22+).
 *
 * Mirrors the web client's pages/authentication/auth.ts:
 *   - signInWithGoogle()   -> Google native sign-in -> Firebase credential
 *   - signInWithApple()    -> Apple native sign-in -> Firebase credential
 *   - signInWithEmail()    -> Firebase email/password
 *   - signUpWithEmail()    -> Firebase create account + verification email
 *   - signOut()            -> Firebase sign-out
 *
 * After any sign-in, the caller should:
 *   1. Get the Firebase idToken via getIdToken(user)
 *   2. POST it to the backend /login endpoint to get a Sanctum token
 */

import {
  getAuth,
  getIdToken as getFirebaseIdToken,
  signInWithCredential,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  onAuthStateChanged as fbOnAuthStateChanged,
  AppleAuthProvider,
  GoogleAuthProvider,
  signOut as firebaseAuthSignOut,
} from '@react-native-firebase/auth';
import { getApp } from '@react-native-firebase/app';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import type { FirebaseAuthTypes } from '@react-native-firebase/auth';

// ---------------------------------------------------------------------------
// Configure Google Sign-In
// ---------------------------------------------------------------------------
GoogleSignin.configure({
  webClientId: '578623964983-iall0oeq2r2mke7trpqqv3pjingqljh0.apps.googleusercontent.com',
  // Firebase only needs the Google ID token. Requesting offline access asks
  // Google for a server auth code too, which adds unnecessary latency here.
  offlineAccess: false,
});

// Modular auth instance
const auth = getAuth(getApp());
const NONCE_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._';

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '<invalid-email>';
  return `${local.slice(0, 2)}***@${domain}`;
}

function generateNonce(length = 32): string {
  const bytes = Crypto.getRandomBytes(length);
  return Array.from(bytes, (byte) => NONCE_CHARSET[byte % NONCE_CHARSET.length]).join('');
}

// ---------------------------------------------------------------------------
// Google Sign-In
// ---------------------------------------------------------------------------

/**
 * Sign in with Google using the native Google Sign-In flow.
 * Returns the Firebase UserCredential.
 */
export async function signInWithGoogle(): Promise<FirebaseAuthTypes.UserCredential> {
  const startedAt = Date.now();
  console.log('[AuthService] Google sign-in start');

  // Check Play Services
  const playServicesStartedAt = Date.now();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  console.log('[AuthService] Google Play Services checked:', Date.now() - playServicesStartedAt, 'ms');

  // Sign in and get the idToken
  const nativeSignInStartedAt = Date.now();
  const signInResult = await GoogleSignin.signIn();
  console.log('[AuthService] Google native sign-in returned:', Date.now() - nativeSignInStartedAt, 'ms');
  const idToken = signInResult?.data?.idToken;

  if (!idToken) {
    throw new Error('Google Sign-In failed: no idToken returned');
  }

  // Create a Google credential with the token (modular API)
  const googleCredential = GoogleAuthProvider.credential(idToken);

  // Sign in to Firebase with the Google credential (modular API)
  const firebaseSignInStartedAt = Date.now();
  const userCredential = await signInWithCredential(auth, googleCredential);
  console.log('[AuthService] Firebase Google credential accepted:', Date.now() - firebaseSignInStartedAt, 'ms');
  console.log('[AuthService] Google sign-in complete:', Date.now() - startedAt, 'ms');
  return userCredential;
}

// ---------------------------------------------------------------------------
// Apple Sign-In
// ---------------------------------------------------------------------------

/**
 * Sign in with Apple using the native iOS flow.
 * Returns the Firebase UserCredential.
 */
export async function signInWithApple(): Promise<FirebaseAuthTypes.UserCredential> {
  const isAvailable = await AppleAuthentication.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Apple Sign-In is not available on this device');
  }

  const rawNonce = generateNonce();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );

  const appleCredential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });

  if (!appleCredential.identityToken) {
    throw new Error('Apple Sign-In failed: no identityToken returned');
  }

  const firebaseCredential = AppleAuthProvider.credential(
    appleCredential.identityToken,
    rawNonce,
  );

  return signInWithCredential(auth, firebaseCredential);
}

// ---------------------------------------------------------------------------
// Email / Password Sign-In
// ---------------------------------------------------------------------------

/**
 * Sign in with email and password via Firebase.
 * Returns the Firebase UserCredential.
 */
export async function signInWithEmail(
  email: string,
  password: string,
): Promise<FirebaseAuthTypes.UserCredential> {
  console.log('[AuthService] Email sign-in start:', maskEmail(email));
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  console.log('[AuthService] Email sign-in success:', {
    uid: userCredential.user.uid,
    emailVerified: userCredential.user.emailVerified,
  });

  // Check email verification (matching web client behaviour).
  // In dev you might want to skip this check.
  if (!userCredential.user.emailVerified) {
    // Allow the sign-in but the backend will also validate.
  }

  return userCredential;
}

// ---------------------------------------------------------------------------
// Email / Password Sign-Up
// ---------------------------------------------------------------------------

/**
 * Create a new account with email and password, then send a verification email.
 */
export async function signUpWithEmail(
  email: string,
  password: string,
): Promise<FirebaseAuthTypes.UserCredential> {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  await sendEmailVerification(userCredential.user);
  return userCredential;
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

// ---------------------------------------------------------------------------
// Sign Out
// ---------------------------------------------------------------------------

/**
 * Sign out of Firebase app auth.
 *
 * Keep the Google SDK session warm so the next Google login can reuse the
 * device account session instead of paying the full native re-auth cost again.
 */
export async function firebaseSignOut(): Promise<void> {
  await firebaseAuthSignOut(auth);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get the currently signed-in Firebase user.
 */
export function getCurrentUser(): FirebaseAuthTypes.User | null {
  return auth.currentUser;
}

/**
 * Get a fresh idToken for the current user.
 */
export async function getIdToken(forceRefresh = false): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return getFirebaseIdToken(user, forceRefresh);
}

/**
 * Subscribe to auth state changes.
 * Returns an unsubscribe function.
 */
export function onAuthStateChanged(
  callback: (user: FirebaseAuthTypes.User | null) => void,
): () => void {
  return fbOnAuthStateChanged(auth, callback);
}
