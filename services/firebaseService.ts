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

// Helper to safely get environment variables from Vite or Process
const getEnv = (key: string): string | undefined => {
  try {
    return (import.meta as any).env?.[key] || (process.env as any)?.[key];
  } catch (e) {
    return (process.env as any)?.[key];
  }
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

// Only initialize if we have at least a Project ID
if (firebaseConfig.projectId && firebaseConfig.projectId !== "undefined") {
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app);
  } catch (error) {
    console.warn("Firestore initialization failed. Falling back to Party Mode.", error);
  }
} else {
  console.log("No Firebase Project ID detected. Running in Local Party Mode.");
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