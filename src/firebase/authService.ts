import {
  createUserWithEmailAndPassword,
  getIdToken as getFirebaseIdToken,
  onAuthStateChanged as fbOnAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseAuthSignOut,
  type User,
  type UserCredential,
} from 'firebase/auth';
import { auth } from './firebaseConfig';

function unsupportedAuthMethod(): never {
  throw new Error('This sign-in method is not available in the Expo web test build.');
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '<invalid-email>';
  return `${local.slice(0, 2)}***@${domain}`;
}

export async function signInWithGoogle(): Promise<never> {
  unsupportedAuthMethod();
}

export async function signInWithApple(): Promise<never> {
  unsupportedAuthMethod();
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<UserCredential> {
  console.log('[AuthService:web] Email sign-in start:', maskEmail(email));
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  console.log('[AuthService:web] Email sign-in success:', {
    uid: userCredential.user.uid,
    emailVerified: userCredential.user.emailVerified,
  });
  return userCredential;
}

export async function signUpWithEmail(
  email: string,
  password: string,
): Promise<UserCredential> {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  await sendEmailVerification(userCredential.user);
  return userCredential;
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

export async function firebaseSignOut(): Promise<void> {
  await firebaseAuthSignOut(auth);
}

export function getCurrentUser(): User | null {
  return auth.currentUser;
}

export async function getIdToken(forceRefresh = false): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return getFirebaseIdToken(user, forceRefresh);
}

export function onAuthStateChanged(callback: (user: User | null) => void): () => void {
  return fbOnAuthStateChanged(auth, callback);
}
