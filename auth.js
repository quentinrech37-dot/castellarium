// auth.js — initialisation Firebase + helpers de base

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

// Copié de la page Firebase (votre config)
const firebaseConfig = {
  apiKey: "AIzaSyCXe7vBCucNCJwyPjPwGv1alwXKH2KPq7E",
  authDomain: "castellarium.firebaseapp.com",
  projectId: "castellarium",
  storageBucket: "castellarium.firebasestorage.app",
  messagingSenderId: "535302512702",
  appId: "1:535302512702:web:70dc9e75764ef16763316f"
};

// Initialisation
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// On expose quelques fonctions utiles au reste du code
window.castellariumAuth = {
  auth,
  signUp(email, password) {
    return createUserWithEmailAndPassword(auth, email, password);
  },
  signIn(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  },
  signOut() {
    return signOut(auth);
  },
  onAuthStateChanged(callback) {
    return onAuthStateChanged(auth, callback);
  },
};

console.log("Firebase Auth initialisé :", auth);

// >>> IMPORTANT : prévenir le reste du code que tout est prêt
window.dispatchEvent(new Event("castellariumAuthReady"));
