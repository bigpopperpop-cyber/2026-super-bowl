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

// Safest way to get environment variables across Vite/Vercel/Production
const getEnv = (key: string): string | undefined => {
  const metaEnv = (import.meta as any).env;
  if (metaEnv && metaEnv[key]) return metaEnv[key];
  
  if (typeof process !== 'undefined' && (process as any).env) {
    return (process as any).env[key];
  }
  
  return undefined;
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

// Validate config is not just "undefined" strings or empty
const isValidConfig = (config: any) => {
  return config.projectId && 
         config.projectId !== "undefined" && 
         config.projectId.trim() !== "";
};

if (isValidConfig(firebaseConfig)) {
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app);
    console.log("Firebase initialized successfully.");
  } catch (error) {
    console.warn("Firestore initialization failed. Running in Local Mode.", error);
  }
} else {
  console.log("Firebase config incomplete or missing. Running in Local Mode.");
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