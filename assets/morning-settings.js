import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const ADMIN="amitmagician6@gmail.com", endpoint="https://me-west1-amit-mitrani-crm.cloudfunctions.net/configureMorningSecrets";
const $=selector=>document.querySelector(selector), locked=$("#locked"), settings=$("#settings"), form=$("#morning-form"), result=$("#form-result"), status=$("#morning-status"), paymentForm=$("#payment-methods-form"), paymentResult=$("#payment-methods-result"), requestForm=$("#payment-request-form"), requestResult=$("#payment-request-result"), linkResult=$("#payment-link-result");
onAuthStateChanged(auth,user=>{
  const allowed=user?.email?.toLowerCase()===ADMIN;
  locked.hidden=allowed;settings.hidden=!allowed;
  if(!allowed){locked.innerHTML="<h1>גישה למנהל בלבד</h1><p>יש לפתוח דרך מערכת הניהול לאחר התחברות.</p>";return;}
  onSnapshot(doc(db,"integrationSettings","morning"),snapshot=>{
    status.textContent=snapshot.data()?.configured?"Morning מחובר. אפשר להחליף את פרטי החיבור כאן רק במקרה הצורך.":"Morning עדיין לא מחובר.";
    status.classList.toggle("connected",snapshot.data()?.configured===true);
  },()=>{status.textContent="המסך מוכן לחיבור Morning.";});
  getDoc(doc(db,"integrationSettings","paymentMethods")).then(snapshot=>{const data=snapshot.data()||{};["bitUrl","bitPhone","payboxUrl","bankName","bankBranch","bankAccount","bankHolder"].forEach(key=>paymentForm[key].value=data[key]||"");}).catch(()=>{});
});
paymentForm.addEventListener("submit",async event=>{
  event.preventDefault();paymentResult.textContent="";
  const button=paymentForm.querySelector("button"), data=new FormData(paymentForm), bitUrl=String(data.get("bitUrl")||"").trim(), bitPhone=String(data.get("bitPhone")||"").trim(), payboxUrl=String(data.get("payboxUrl")||"").trim(), bankName=String(data.get("bankName")||"").trim(), bankBranch=String(data.get("bankBranch")||"").trim(), bankAccount=String(data.get("bankAccount")||"").trim(), bankHolder=String(data.get("bankHolder")||"").trim();
  const bankValues=[bankName,bankBranch,bankAccount,bankHolder];
  if(!bitUrl && !bitPhone && !payboxUrl && !bankValues.some(Boolean)){paymentResult.textContent="יש למלא לפחות אמצעי תשלום אחד.";return;}
  if(bitUrl){try{const url=new URL(bitUrl);if(url.protocol!=="https:")throw new Error();}catch{paymentResult.textContent="קישור Bit צריך להתחיל ב‑https://";return;}}
  if(bankValues.some(Boolean)&&bankValues.some(value=>!value)){paymentResult.textContent="להעברה בנקאית יש למלא את כל פרטי החשבון.";return;}
  if(payboxUrl){try{const url=new URL(payboxUrl);if(url.protocol!=="https:")throw new Error();}catch{paymentResult.textContent="קישור PayBox צריך להתחיל ב‑https://";return;}}
  button.disabled=true;button.textContent="שומר…";
  try{await setDoc(doc(db,"integrationSettings","paymentMethods"),{bitUrl,bitPhone,payboxUrl,bankName,bankBranch,bankAccount,bankHolder,updatedAt:serverTimestamp(),updatedBy:auth.currentUser.email},{merge:true});paymentResult.textContent="אמצעי התשלום נשמרו. עכשיו אפשר לבנות דרישת תשלום חדשה ללקוחה.";paymentResult.className="form-result success";}catch(error){paymentResult.textContent="לא הצלחנו לשמור. נסה שוב.";paymentResult.className="form-result error";}finally{button.disabled=false;button.textContent="שמירת אמצעי תשלום";}
});
requestForm.addEventListener("submit",async event=>{
  event.preventDefault();requestResult.textContent="";linkResult.hidden=true;
  const button=requestForm.querySelector("button"), data=Object.fromEntries(new FormData(requestForm));
  button.disabled=true;button.textContent="מכין קישור אישי…";
  try{const idToken=await auth.currentUser.getIdToken(), response=await fetch("https://me-west1-amit-mitrani-crm.cloudfunctions.net/createPaymentRequest",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${idToken}`},body:JSON.stringify(data)}), payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.message||"לא הצלחנו להכין קישור.");const text=`היי ${data.customerName}, מצורף קישור אישי לתשלום עבור ${data.description}:\n${payload.url}`;linkResult.hidden=false;linkResult.innerHTML=`<strong>קישור התשלום מוכן</strong><input readonly value="${payload.url}" aria-label="קישור אישי לתשלום"><div class="request-link-actions"><button class="primary" type="button">העתקת הקישור</button><a class="secondary" target="_blank" rel="noopener" href="https://wa.me/${String(data.customerPhone||"").replace(/\D/g,"")}?text=${encodeURIComponent(text)}">שליחה ב‑WhatsApp</a></div>`;linkResult.querySelector("button").onclick=async()=>{await navigator.clipboard.writeText(payload.url);linkResult.querySelector("button").textContent="הקישור הועתק ✓";};requestResult.textContent="הקישור מוכן לשליחה.";requestResult.className="form-result success";}catch(error){requestResult.textContent=error.message||"לא הצלחנו להכין קישור.";requestResult.className="form-result error";}finally{button.disabled=false;button.textContent="יצירת קישור לתשלום";}
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
