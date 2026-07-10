// firebase-config.js

// Replace these values with your actual Firebase Project credentials
// You can find these in Firebase Console -> Project Settings -> General
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAap9Ks7jfV6b_Ek0fRVh0WTA0xwPrjvE0",
  projectId: "leetsync-pro",
  
  // For OAuth (Google/GitHub) we need the Auth Domain
  authDomain: "leetsync-pro.firebaseapp.com",

  // Google OAuth credentials
  googleClientId: "1012755253331-p9m62k5vv8di1mplkimd73q8mkudkqe8.apps.googleusercontent.com",

  // GitHub OAuth credentials
  githubClientId: "Ov23liWhO0nM71iGiihz",
  githubClientSecret: "c1ed8f7f3fcdc3e7b6358049a23729c3cfc506ed"
};

// Base URLs for Firebase REST APIs
export const FIREBASE_AUTH_API = `https://identitytoolkit.googleapis.com/v1`;
export const getFirestoreApiUrl = () => `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;
