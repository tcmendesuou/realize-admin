import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyB8hJrvgrc3W5tHqrf1iWVdGQ0IQDBpytY",
  authDomain: "realize-324a1.firebaseapp.com",
  projectId: "realize-324a1",
  storageBucket: "realize-324a1.firebasestorage.app",
  messagingSenderId: "462626487353",
  appId: "1:462626487353:web:f9cf4e82546302c6b821e8"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Inicializar serviços
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);