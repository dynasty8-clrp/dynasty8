import { auth } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const form = document.getElementById("loginForm");
const message = document.getElementById("loginMessage");

onAuthStateChanged(auth, (user) => {
  if (user) window.location.href = "dashboard.html";
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  message.textContent = "Signing in...";

  try {
    await signInWithEmailAndPassword(
      auth,
      document.getElementById("email").value.trim(),
      document.getElementById("password").value
    );
  } catch (error) {
    console.error(error);
    message.textContent = "Login failed. Check the email and password.";
  }
});
