import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDUFPZuNXNsR4Kg5YCZ_-_IFFR9z3rtoE4",
  authDomain: "dynasty8-clrp.firebaseapp.com",
  projectId: "dynasty8-clrp",
  storageBucket: "dynasty8-clrp.firebasestorage.app",
  messagingSenderId: "281552849758",
  appId: "1:281552849758:web:61f04ecec2be0f40fd5dcf",
  measurementId: "G-E89P11GR64"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);