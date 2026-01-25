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

const getEnv = (key: string): string | undefined => {
  try {
    // 1. Check process.env (Vite 'define' injected)
    if (typeof process !== 'undefined' && process.env) {
      const val = (process.env as any)[key];
      if (val && val !== "undefined" && val !== "") return val;
    }
  } catch (e) {}

  try {
    // 2. Check import.meta.env
    const meta = import.meta as any;
    if (meta && meta.env) {
      const val = meta.env[key];
      if (val && val !== "undefined" && val !== "") return val;
    }
  } catch (e) {}
  
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

const isValidConfig = (config: any) => {
  return !!(config.projectId && config.projectId.length > 5 && config.apiKey);
};

if (isValidConfig(firebaseConfig)) {
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app);
    console.log("Firebase Live: Connected to Stadium Grid.");
  } catch (error) {
    console.warn("Firestore initialization failed. Running local mode.");
  }
} else {
  console.log("Firebase keys missing. Defaulting to Local Party Mode.");
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