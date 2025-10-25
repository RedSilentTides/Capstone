// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBwJPJeP_J_AffNfygR9fx9ZT732cDl_jc",
  authDomain: "composed-apogee-475623-p6.firebaseapp.com",
  projectId: "composed-apogee-475623-p6",
  storageBucket: "composed-apogee-475623-p6.firebasestorage.app",
  messagingSenderId: "687053793381",
  appId: "1:687053793381:web:2bc620ae3586434c29be8c",
  measurementId: "G-BHWEE84XZT"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

isSupported().then((supported) => {
  if (supported) {
    const analytics = getAnalytics(app);
    console.log("Firebase Analytics inicializado.");
  } else {
    console.log("Firebase Analytics no es compatible en este entorno.");
  }
});