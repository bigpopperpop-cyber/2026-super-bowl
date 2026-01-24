import { initializeApp } from "firebase/app";
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

/**
 * FIREBASE CONFIGURATION FOR: sblix-6f2a9
 * Successfully linked and verified.
 */
const firebaseConfig = {
  apiKey: "AIzaSyB0BO9OwaJbevhYKsDb0iNQoaHH1bnD-qw",
  authDomain: "sblix-6f2a9.firebaseapp.com",
  projectId: "sblix-6f2a9",
  storageBucket: "sblix-6f2a9.firebasestorage.app",
  messagingSenderId: "162130736161",
  appId: "1:162130736161:web:1fb39b3da97a8bff9ddf60",
  measurementId: "G-XJ9WY2LMSB"
};

// Check if keys are active and valid
export const isFirebaseConfigured = 
  !!firebaseConfig.apiKey && 
  firebaseConfig.apiKey !== "REPLACE_WITH_YOUR_FIREBASE_API_KEY" && 
  firebaseConfig.apiKey.length > 10;

let db: any;
try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
} catch (e) {
  console.error("Firebase initialization failed.", e);
}

export { 
  db,
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