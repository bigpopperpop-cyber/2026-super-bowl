import { initializeApp, getApp, getApps } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc, 
  addDoc,
  query, 
  where, 
  serverTimestamp, 
  orderBy,
  limit,
  deleteDoc,
  getDocs
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB0BO9OwaJbevhYKsDb0iNQoaHH1bnD-qw",
  authDomain: "sblix-6f2a9.firebaseapp.com",
  projectId: "sblix-6f2a9",
  storageBucket: "sblix-6f2a9.firebasestorage.app",
  messagingSenderId: "162130736161",
  appId: "1:162130736161:web:1fb39b3da97a8bff9ddf60",
  measurementId: "G-XJ9WY2LMSB"
};

export const isFirebaseConfigured = 
  !!firebaseConfig.apiKey && 
  firebaseConfig.apiKey !== "REPLACE_WITH_YOUR_FIREBASE_API_KEY";

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);

export { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc, 
  addDoc,
  query, 
  where, 
  serverTimestamp, 
  orderBy, 
  limit, 
  deleteDoc, 
  getDocs 
};