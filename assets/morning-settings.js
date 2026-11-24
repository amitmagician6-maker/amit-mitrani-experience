import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const ADMIN="amitmagician6@gmail.com", endpoint="https://me-west1-amit-mitrani-crm.cloudfunctions.net/configureMorningSecrets";
const $=selector=>document.querySelector(selector), locked=$("#locked"), settings=$("#settings"), form=$("#morning-form"), result=$("#form-result"), status=$("#morning-status");
onAuthStateChanged(auth,user=>{
  const allowed=user?.email?.toLowerCase()===ADMIN;
  locked.hidden=allowed;settings.hidden=!allowed;
  if(!allowed){locked.innerHTML="<h1>גישה למנהל בלבד</h1><p>יש לפתוח דרך מערכת הניהול לאחר התחברות.</p>";return;}
  onSnapshot(doc(db,"integrationSettings","morning"),snapshot=>{
    status.textContent=snapshot.data()?.configured?"Morning מחובר. אפשר להחליף את פרטי החיבור כאן רק במקרה הצורך.":"Morning עדיין לא מחובר.";
    status.classList.toggle("connected",snapshot.data()?.configured===true);
  },()=>{status.textContent="המסך מוכן לחיבור Morning.";});
});
form.addEventListener("submit",async event=>{
  event.preventDefault(); result.textContent="";
  const button=form.querySelector("button"), data=new FormData(form), apiKey=String(data.get("apiKey")||"").trim(), apiSecret=String(data.get("apiSecret")||"").trim();
  if(apiKey.length<12||apiSecret.length<12){result.textContent="יש להדביק את שני הערכים המלאים מ‑Morning.";return;}
  button.disabled=true;button.textContent="שומר חיבור מאובטח…";
  try{
    const idToken=await auth.currentUser.getIdToken();
    const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${idToken}`},body:JSON.stringify({apiKey,apiSecret})});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.message||"לא הצלחנו לשמור את החיבור.");
    form.reset();result.textContent="החיבור נשמר באופן מאובטח. אפשר להמשיך לשלב התשלום.";result.className="form-result success";
  }catch(error){result.textContent=error.message||"לא הצלחנו לשמור את החיבור.";result.className="form-result error";}
  finally{button.disabled=false;button.textContent="שמירת חיבור Morning";}
});
