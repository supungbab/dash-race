// src/config/firebase.ts
import { initializeApp } from "firebase/app";
import { connectDatabaseEmulator, getDatabase, ref as dbRef, runTransaction, onValue, set, update, remove } from "firebase/database";

export { dbRef, runTransaction, onValue, set, update, remove };

// Firebase 프로젝트 설정 (환경 변수에서 로드)
// Firebase Console: https://console.firebase.google.com/
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL
};

// 초기화
const app = initializeApp(firebaseConfig);

// Realtime Database 초기화
export const dbRealTime = getDatabase(app);

// 로컬 개발 환경에서 에뮬레이터 연결
if (import.meta.env.DEV) {
  console.log("🔧 Firebase 에뮬레이터에 연결중...");
  
  // Realtime Database 에뮬레이터
  connectDatabaseEmulator(dbRealTime, "localhost", 9000);
  
  console.log("✅ Firebase 에뮬레이터 연결 완료");
}
