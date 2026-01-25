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
  authDomain: "party-chat-sblix.firebaseapp.com",
  projectId: "party-chat-sblix",
  storageBucket: "party-chat-sblix.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:sblix"
};

let db: any = null;

try {
  const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  db = getFirestore(app);
} catch (e) {
  console.warn("Firestore could not be initialized automatically. Using local-first mode.", e);
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