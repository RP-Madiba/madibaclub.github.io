// Les seules fonctions de Firebase dont l'application a besoin (le reste n'est pas livré).
export { initializeApp } from "firebase/app";
export {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence,
  onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail
} from "firebase/auth";
export {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, getDocFromCache, getDocsFromCache, setDoc, serverTimestamp, deleteField, terminate, clearIndexedDbPersistence,
  collection, getDocs, query, where, orderBy, limit, addDoc, deleteDoc, updateDoc, writeBatch
} from "firebase/firestore";
