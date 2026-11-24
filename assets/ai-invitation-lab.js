import { auth,db,storage } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { collection,doc,onSnapshot,serverTimestamp,setDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { getDownloadURL,ref } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js";

const ADMIN="amitmagician6@gmail.com",$=selector=>document.querySelector(selector),safe=value=>String(value||"").trim();
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value.toUpperCase())))).map(x=>x.toString(16).padStart(2,"0")).join("");
const token=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
const lab=$("#lab"),locked=$("#lab-locked"),linkButton=$("#create-request-link"),linkResult=$("#request-link-result"),list=$("#request-list");
const date=value=>value?.toDate?new Intl.DateTimeFormat("he-IL",{dateStyle:"medium",timeStyle:"short"}).format(value.toDate()):"";
const escape=value=>safe(value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));

const render=async items=>{
  if(!items.length){list.innerHTML='<p class="empty">עדיין לא התקבלו בקשות.</p>';return}
  const cards=await Promise.all(items.map(async item=>{
    const children=Array.isArray(item.children)?item.children:[],images=Array.isArray(item.images)?item.images:[];
    const thumbs=await Promise.all(images.slice(0,4).map(async image=>{try{const url=await getDownloadURL(ref(storage,image.path));return /^image\/(heic|heif)$/.test(image.contentType||"")?`<a class="heic-file" href="${url}" target="_blank" rel="noopener">פתיחת תמונת iPhone</a>`:`<img src="${url}" alt="תמונה שנשלחה בבקשה">`}catch{return ""}}));
    const names=children.map(child=>child.name).filter(Boolean).join(" ו ")||"ללא שם";
    const address=[item.street,item.houseNumber,item.city].filter(Boolean).join(" ");
    return `<article class="request-item"><div><strong>${escape(names)}</strong><p>${escape(item.eventDate)} · ${escape(item.eventTime)} · ${escape(item.style||"ללא סגנון")}</p><small><b>כתובת:</b> ${escape(address)}${item.venueType?` — ${escape(item.venueType)}`:""}${item.venueDetails?`, ${escape(item.venueDetails)}`:""}</small><small><b>איש קשר:</b> ${escape(item.contactName)} · ${escape(item.contactPhone)}</small>${thumbs.some(Boolean)?`<div class="request-images">${thumbs.join("")}</div>`:""}</div><small>${date(item.createdAt)||"חדש"}<br>${images.length} תמונות</small></article>`;
  }));
  list.innerHTML=cards.join("");
};
const listen=()=>onSnapshot(collection(db,"invitationRequests"),snapshot=>render(snapshot.docs.map(entry=>({id:entry.id,...entry.data()})).sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0))),error=>{console.error(error);list.innerHTML='<p class="empty">לא הצלחנו לטעון את הבקשות.</p>'});

linkButton.addEventListener("click",async()=>{
  linkButton.disabled=true;linkButton.textContent="מכין קישור…";
  try{const raw=token(),id=await hash(raw),expiresAt=new Date();expiresAt.setDate(expiresAt.getDate()+14);await setDoc(doc(db,"invitationRequestAccess",id),{active:true,used:false,expiresAt,createdAt:serverTimestamp()});const url=`${location.origin}/invitation-request.html?access=${encodeURIComponent(raw)}`;linkResult.hidden=false;linkResult.innerHTML=`<strong>הקישור האישי מוכן</strong><input readonly value="${escape(url)}" aria-label="קישור אישי למילוי פרטי הזמנה"><div class="request-link-actions"><button class="primary" type="button">העתקת הקישור</button><a class="secondary" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`היי, כדי להכין את ההזמנה הדיגיטלית אנא מלאו את הפרטים בקישור האישי הזה:\n${url}`)}">שליחה ב־WhatsApp</a></div>`;linkResult.querySelector("button").onclick=async()=>{await navigator.clipboard.writeText(url);linkResult.querySelector("button").textContent="הקישור הועתק ✓"};}catch(error){console.error(error);alert("לא הצלחנו להכין קישור אישי.")}finally{linkButton.disabled=false;linkButton.textContent="יצירת קישור למילוי פרטים"}
});
$("#refresh-requests").addEventListener("click",()=>location.reload());
onAuthStateChanged(auth,user=>{const allowed=user?.email?.toLowerCase()===ADMIN;locked.hidden=allowed;lab.hidden=!allowed;if(allowed)listen();else locked.innerHTML="<h1>גישה למנהל בלבד</h1><p>יש לפתוח את העמוד דרך מערכת הניהול לאחר התחברות.</p>"});
