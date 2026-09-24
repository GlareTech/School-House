import { getAnalytics, isSupported } from 'firebase/analytics';
import { getApps, initializeApp } from 'firebase/app';

export const firebaseConfig = {
  apiKey: 'AIzaSyDfXc_iz3Y51r1gkp5sKExGnz5HHr4BrJg',
  authDomain: 'ife-psyche.firebaseapp.com',
  databaseURL: 'https://ife-psyche.firebaseio.com',
  projectId: 'ife-psyche',
  storageBucket: 'ife-psyche.firebasestorage.app',
  messagingSenderId: '621295505545',
  appId: '1:621295505545:web:de2535d9773baced4d7658',
  measurementId: 'G-V13Y8P5TT3',
};

export const firebaseApp = getApps()[0] ?? initializeApp(firebaseConfig);

// Analytics is browser-only and can be unavailable when storage/cookies are blocked.
export const analytics = isSupported()
  .then((supported) => (supported ? getAnalytics(firebaseApp) : null))
  .catch(() => null);
