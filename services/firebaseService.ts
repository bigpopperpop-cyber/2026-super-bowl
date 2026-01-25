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

// Note: Using process.env.API_KEY which is expected to be provided by the environment.
const firebaseConfig = {
  apiKey: (process.env as any).API_KEY,
  authDomain: "sblix-chat.firebaseapp.com",
  projectId: "sblix-chat",
  storageBucket: "sblix-chat.appspot.com",
  messagingSenderId: "987654321",
  appId: "1:987654321:web:sblix"
};

let app;
let db: any = null;

try {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  db = getFirestore(app);
} catch (error) {
  console.error("Firebase/Firestore setup failed:", error);
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