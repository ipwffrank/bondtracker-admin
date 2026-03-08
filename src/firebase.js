import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBkQnlYdOsIki_VuEpMBsIFACLN-u2FYFo",
  authDomain: "bond-sales-tracker.firebaseapp.com",
  projectId: "bond-sales-tracker",
  storageBucket: "bond-sales-tracker.firebasestorage.app",
  messagingSenderId: "293591418173",
  appId: "1:293591418173:web:b0ca2b77f514dc6c9b3154"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
