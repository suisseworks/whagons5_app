/**
 * Auth service – wraps Firebase Auth + Google Sign-In for the mobile app.
 *
 * Uses @react-native-firebase modular API (v22+).
 *
 * Mirrors the web client's pages/authentication/auth.ts:
 *   - signInWithGoogle()   -> Google native sign-in -> Firebase credential
 *   - signInWithEmail()    -> Firebase email/password
 *   - signUpWithEmail()    -> Firebase create account + verification email
 *   - signOut()            -> Firebase sign-out
 *
 * After any sign-in, the caller should:
 *   1. Get the Firebase idToken via user.getIdToken()
 *   2. POST it to the backend /login endpoint to get a Sanctum token
 */

import {
  getAuth,
  signInWithCredential,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  onAuthStateChanged as fbOnAuthStateChanged,
  GoogleAuthProvider,
} from '@react-native-firebase/auth';
import { getApp } from '@react-native-firebase/app';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import type { FirebaseAuthTypes } from '@react-native-firebase/auth';

// ---------------------------------------------------------------------------
// Configure Google Sign-In
// ---------------------------------------------------------------------------
GoogleSignin.configure({
  webClientId: '578623964983-iall0oeq2r2mke7trpqqv3pjingqljh0.apps.googleusercontent.com',
  offlineAccess: true,
});

// Modular auth instance
const auth = getAuth(getApp());

// ---------------------------------------------------------------------------
// Google Sign-In
// ---------------------------------------------------------------------------

/**
 * Sign in with Google using the native Google Sign-In flow.
 * Returns the Firebase UserCredential.
 */
export async function signInWithGoogle(): Promise<FirebaseAuthTypes.UserCredential> {
  // Check Play Services
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  // Sign in and get the idToken
  const signInResult = await GoogleSignin.signIn();
  const idToken = signInResult?.data?.idToken;

  if (!idToken) {
    throw new Error('Google Sign-In failed: no idToken returned');
  }

  // Create a Google credential with the token (modular API)
  const googleCredential = GoogleAuthProvider.credential(idToken);

  // Sign in to Firebase with the Google credential (modular API)
  return signInWithCredential(auth, googleCredential);
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
  const userCredential = await signInWithEmailAndPassword(auth, email, password);

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

// ---------------------------------------------------------------------------
// Sign Out
// ---------------------------------------------------------------------------

/**
 * Sign out of both Firebase and Google (if applicable).
 */
export async function firebaseSignOut(): Promise<void> {
  try {
    await GoogleSignin.signOut();
  } catch {
    // Google sign-out may fail if user didn't sign in with Google -- that's OK.
  }
  await auth.signOut();
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
  return user.getIdToken(forceRefresh);
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
