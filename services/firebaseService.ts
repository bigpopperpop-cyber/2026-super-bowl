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

const firebaseConfig = {
  apiKey: (process.env as any).API_KEY,
  authDomain: "sblix-party.firebaseapp.com",
  projectId: "sblix-party",
  storageBucket: "sblix-party.appspot.com",
  messagingSenderId: "987654321",
  appId: "1:987654321:web:sblix"
};

let db: any = null;

try {
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  db = getFirestore(app);
} catch (error) {
  console.warn("Firestore initialization failed. App will run in Party Demo mode.", error);
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