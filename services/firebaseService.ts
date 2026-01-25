import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  serverTimestamp 
} from 'firebase/firestore';

// Safer environment variable access for Vite/Vercel environments
const getEnv = (key: string): string | undefined => {
  const metaEnv = (import.meta as any).env;
  const procEnv = (process as any).env;
  return metaEnv?.[key] || procEnv?.[key];
};

const firebaseConfig = {
  apiKey: getEnv('VITE_FIREBASE_API_KEY'),
  authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: getEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: getEnv('VITE_FIREBASE_APP_ID')
};

let db: any = null;

// Only initialize if we have the critical bits
if (firebaseConfig.projectId && firebaseConfig.projectId !== "undefined") {
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app);
  } catch (error) {
    console.warn("Firestore initialization failed. Running in Local Mode.", error);
  }
} else {
  console.log("Firebase config incomplete. Using Local Mode.");
}

export { 
  db, 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  serverTimestamp 
};