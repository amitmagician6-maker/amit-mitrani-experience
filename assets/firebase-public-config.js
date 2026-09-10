import { initializeApp,getApp,getApps } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const firebaseConfig={apiKey:"AIzaSyD_UIZZiiwrKrNMQQAtmO3m4HjVw38VhoY",authDomain:"amit-mitrani-crm.firebaseapp.com",projectId:"amit-mitrani-crm",storageBucket:"amit-mitrani-crm.firebasestorage.app",messagingSenderId:"292775906846",appId:"1:292775906846:web:d200c406baef12be15a80f"};
const app=getApps().length?getApp():initializeApp(firebaseConfig);
const db=getFirestore(app);

export {app,db};
