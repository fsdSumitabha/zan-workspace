import { initializeApp, getApps, getApp, type FirebaseApp, type FirebaseOptions } from "firebase/app"

// The public web config. These values are safe to show in the browser.
export const firebaseConfig: FirebaseOptions = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

// The public VAPID key. The push code passes it to register().
export const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY

// Start Firebase once. Reuse it if it already exists.
// It is a function, so the server can import firebaseConfig without starting Firebase.
export function getFirebaseApp(): FirebaseApp {
    return getApps().length ? getApp() : initializeApp(firebaseConfig)
}
