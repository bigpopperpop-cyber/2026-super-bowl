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

// Explicitly define config using direct process.env access for Vite string replacement
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

let db: any = null;

const isValidConfig = (config: any) => {
  // Check if keys exist and aren't just empty strings or literal "undefined" strings
  const keys = ['apiKey', 'projectId', 'appId'];
  return keys.every(key => 
    config[key] && 
    config[key] !== "" && 
    config[key] !== "undefined" && 
    config[key].length > 3
  );
};

if (isValidConfig(firebaseConfig)) {
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app);
    console.log("Firebase initialized successfully.");
  } catch (error) {
    console.warn("Firestore initialization error:", error);
  }
} else {
  console.log("Missing Firebase keys. Check Diagnostics in the app UI.");
}

// Helper to check which keys are missing for the UI diagnostic tool
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
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  serverTimestamp 
};