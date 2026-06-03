import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  getIdToken as getFirebaseIdToken,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyAD1bLLRlRUoS2rEg3ZKqGQ3bE1chfySSY',
  authDomain: 'whagons-5.firebaseapp.com',
  projectId: 'whagons-5',
  storageBucket: 'whagons-5.firebasestorage.app',
  messagingSenderId: '578623964983',
  appId: '1:578623964983:web:04c33feb2475cfe97546fc',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

export { app, auth };

export function onFirebaseAuthStateChanged(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export function getIdTokenForUser(user: User, forceRefresh = false) {
  return getFirebaseIdToken(user, forceRefresh);
}

export function currentFirebaseUser() {
  return auth.currentUser;
}

export async function getIdToken(forceRefresh = false): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return getFirebaseIdToken(user, forceRefresh);
}
