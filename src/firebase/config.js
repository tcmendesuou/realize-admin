import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, browserSessionPersistence, setPersistence } from "firebase/auth";
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

// IMPORTANTE: por padrão, o login do Firebase Auth fica no localStorage,
// que é COMPARTILHADO entre todas as abas do mesmo navegador — logar numa
// aba nova "contamina" as outras. Trocando pra sessionStorage, cada aba
// guarda sua própria sessão, isolada de verdade (não precisa mais de aba
// anônima pra testar vários perfis ao mesmo tempo).
// Efeito colateral aceitável: fechar a aba desloga (não persiste entre
// reaberturas do navegador, só entre recarregamentos da mesma aba).
setPersistence(auth, browserSessionPersistence).catch(err => console.error('Erro ao configurar persistência do Auth:', err));
