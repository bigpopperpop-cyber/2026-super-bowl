import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  setDoc,
  doc,
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  serverTimestamp 
} from 'firebase/firestore';

// Vite standard: Use import.meta.env primarily, fallback to process.env (for older platforms)
const getV = (key: string) => {
  const meta = (import.meta as any).env;
  const proc = (typeof process !== 'undefined' ? process.env : {}) as any;
  return meta?.[key] || proc?.[key] || "";
};

const firebaseConfig = {
  apiKey: getV('VITE_FIREBASE_API_KEY'),
  authDomain: getV('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: getV('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: getV('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getV('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: getV('VITE_FIREBASE_APP_ID')
};

let db: any = null;

const isValidConfig = (config: any) => {
  return (
    config.apiKey?.length > 10 && 
    config.projectId?.length > 3 && 
    config.appId?.length > 10
  );
};

if (isValidConfig(firebaseConfig)) {
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app);
    console.log("SBLIX LIVE: Grid synchronized.");
  } catch (error) {
    console.warn("SBLIX LIVE ERROR: Database offline.");
  }
} else {
  console.log("SBLIX HUB: Running in local Party Mode (Missing Keys).");
}

export const getMissingKeys = () => {
  const missing = [];
  if (!firebaseConfig.apiKey) missing.push("VITE_FIREBASE_API_KEY");
  if (!firebaseConfig.projectId) missing.push("VITE_FIREBASE_PROJECT_ID");
  if (!firebaseConfig.appId) missing.push("VITE_FIREBASE_APP_ID");
  return missing;
};

export { 
  db, 
  collection, 
  addDoc, 
  setDoc,
  doc,
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  serverTimestamp 
};