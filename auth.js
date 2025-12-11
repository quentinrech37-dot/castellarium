// auth.js — initialisation Firebase + helpers de base

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// Config Firebase
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
const db   = getFirestore(app);

// Expose Auth
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

// Expose une petite API pour les listes utilisateur
window.castellariumDB = {
  db,
  async loadUserState(uid) {
    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      return { visitedIds: [], wishlistIds: [] };
    }
    const data = snap.data();
    return {
      visitedIds: data.visitedIds || [],
      wishlistIds: data.wishlistIds || [],
    };
  },
  async saveUserState(uid, visitedIds, wishlistIds) {
    const ref = doc(db, "users", uid);
    await setDoc(ref, {
      visitedIds,
      wishlistIds,
      updatedAt: new Date(),
    }, { merge: true });
  },
};

console.log("Firebase (Auth + Firestore) initialisé :", { auth, db });

// Prévenir le reste du code que tout est prêt
window.dispatchEvent(new Event("castellariumAuthReady"));
