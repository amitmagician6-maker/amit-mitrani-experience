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
  const count = form.elements.guestCount;
  const details = form.querySelector("#rsvp-details");
  const open = () => {
    if (count.disabled) return;
    details.hidden = false;
    details.disabled = false;
  };
  count.addEventListener("click", open);
  count.addEventListener("change", () => {
    form.elements.response.value = count.value === "0" ? "no" : "yes";
    open();
  });
  return () => {
    details.hidden = true;
    details.disabled = true;
    count.disabled = true;
  };
}
