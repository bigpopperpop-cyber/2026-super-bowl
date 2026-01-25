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

// Helper to check for stored override config
const getStoredConfig = () => {
  try {
    const stored = localStorage.getItem('SBLIX_FIREBASE_OVERRIDE');
    return stored ? JSON.parse(stored) : null;
  } catch (e) {
    return null;
  }
};

const getV = (key: string) => {
  const meta = (import.meta as any).env;
  const proc = (typeof process !== 'undefined' ? process.env : {}) as any;
  return meta?.[key] || proc?.[key] || "";
};

const envConfig = {
  apiKey: getV('VITE_FIREBASE_API_KEY'),
  authDomain: getV('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: getV('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: getV('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getV('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: getV('VITE_FIREBASE_APP_ID')
};

const overrideConfig = getStoredConfig();
const firebaseConfig = overrideConfig || envConfig;

let db: any = null;

const isValidConfig = (config: any) => {
  return (
    config &&
    config.apiKey?.length > 10 && 
    config.projectId?.length > 3 && 
    config.appId?.length > 10
  );
};

if (isValidConfig(firebaseConfig)) {
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app);
    console.log("SBLIX LIVE: Database online via " + (overrideConfig ? "Manual Config" : "Build Keys"));
  } catch (error) {
    console.warn("SBLIX LIVE ERROR: Initialization failed.");
  }
}

export const saveManualConfig = (configStr: string) => {
  try {
    const parsed = JSON.parse(configStr);
    if (isValidConfig(parsed)) {
      localStorage.setItem('SBLIX_FIREBASE_OVERRIDE', configStr);
      window.location.reload();
      return true;
    }
  } catch (e) {
    return false;
  }
  return false;
};

export const clearManualConfig = () => {
  localStorage.removeItem('SBLIX_FIREBASE_OVERRIDE');
  window.location.reload();
};

export const getMissingKeys = () => {
  if (overrideConfig) return [];
  const missing = [];
  if (!envConfig.apiKey) missing.push("VITE_FIREBASE_API_KEY");
  if (!envConfig.projectId) missing.push("VITE_FIREBASE_PROJECT_ID");
  if (!envConfig.appId) missing.push("VITE_FIREBASE_APP_ID");
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