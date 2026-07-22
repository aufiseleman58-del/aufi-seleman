import { initializeApp, setLogLevel } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer, collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';
import firebaseConfig from '../../firebase-applet-config.json';

// Silence warning-level messages from the Firebase SDK to avoid false-alarm warning messages in the logs
setLogLevel('error');

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

let localCacheConfig: any = undefined;
try {
  localCacheConfig = persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  });
} catch (e) {
  console.warn("Firestore persistent LocalCache is not supported in this iframe environment; falling back to memory-only representation.");
}

export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  ignoreUndefinedProperties: true,
  ...(localCacheConfig ? { localCache: localCacheConfig } : {}),
}, firebaseConfig.firestoreDatabaseId);
export const storage = getStorage(app);

// Initialize Messaging lazily to avoid errors in environments that don't support it (like some iframes)
let messaging: Messaging | null = null;
try {
  messaging = getMessaging(app);
} catch (e) {
  console.warn("Firebase Messaging is not supported in this browser environment.");
}

export { messaging, getToken, onMessage };
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  }
  if (!auth.currentUser) {
    console.warn('Firestore Access Denied (Unauthenticated):', JSON.stringify(errInfo));
    return;
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  console.log("Starting Firestore connectivity test...");
  // Wait 5 seconds before testing connection to allow SDK and network to stabilize
  await new Promise(resolve => setTimeout(resolve, 5000));
  try {
    // Use a non-existent doc to test connectivity without needing data
    await getDocFromServer(doc(db, '_health_', 'check'));
    console.log("Firestore connection established successfully.");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('the client is offline') || msg.includes('Could not reach') || msg.includes('unavailable')) {
      console.warn("Firestore could not reach the backend (unavailable) during setup. This often happens due to temporary network issues or missing database setup.");
      console.info("Falling back to internal cache/offline mode. Connectivity may be restored automatically once connection stabilizes.");
    } else if (msg.includes('permission-denied') || msg.includes('Permission denied')) {
      console.log("Firestore connectivity verified (received expected permission-denied).");
    } else {
      console.log("Firestore connectivity test finished with message:", msg);
    }
  }
}
testConnection();
