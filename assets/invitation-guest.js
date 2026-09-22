export function decodeFirestoreValue(value) {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return { toDate: () => new Date(value.timestampValue) };
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeFirestoreValue);
  if ("mapValue" in value) return decodeFields(value.mapValue.fields || {});
  return null;
}
const decodeFields = fields => Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)]));

export async function readPublicInvitation(id) {
  if (!/^[A-Za-z0-9_-]{10,80}$/.test(id)) throw new Error("invalid-id");
  const url = `https://firestore.googleapis.com/v1/projects/amit-mitrani-crm/databases/(default)/documents/invitations/${encodeURIComponent(id)}`;
  // The head starts this anonymous read while HTML, CSS and JS are downloading.
  // Firestore applies the same active/expiry rules as the SDK read.
  const response = await (window.invitationRead || fetch(url, { signal: AbortSignal.timeout(15000) }));
  if (!response?.ok) throw new Error("invitation-unavailable");
  const document = await response.json();
  return decodeFields(document.fields || {});
}

export function setupCompactRsvp(form) {
  const count=form.elements.guestCount,details=form.querySelector('#rsvp-details');
  const plus=form.querySelector('#rsvp-plus'),minus=form.querySelector('#rsvp-minus'),decline=form.querySelector('#rsvp-decline'),display=form.querySelector('#rsvp-count-display');
  const setCount=(value,response='yes')=>{
    if(count.disabled)return;
    count.value=String(value);form.elements.response.value=response;display.textContent=response==='no'?'לא נגיע':String(value);
    minus.disabled=value<=1;plus.disabled=value>=20;
    details.hidden=false;details.disabled=false;
  };
  plus.onclick=()=>setCount(Math.min(20,Number(count.value)+1));
  minus.onclick=()=>setCount(Math.max(1,Number(count.value)-1));
  decline.onclick=()=>setCount(0,'no');
  return ()=>{details.hidden=true;details.disabled=true;count.disabled=true;plus.disabled=true;minus.disabled=true;decline.disabled=true};
}
