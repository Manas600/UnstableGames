// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyDIxzPN9xVat-MkBgCVazbs2jHOc_YIBYQ",
    authDomain: "unstable-fe374.firebaseapp.com",
    databaseURL: "https://unstable-fe374-default-rtdb.firebaseio.com",
    projectId: "unstable-fe374",
    storageBucket: "unstable-fe374.firebasestorage.app",
    messagingSenderId: "168796416579",
    appId: "1:168796416579:web:5bca1a4bab213e70e5c2f6",
    measurementId: "G-PXRSZQPMZ2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);