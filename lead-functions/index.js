import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { defineSecret } from "firebase-functions/params";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";

initializeApp();
const db = getFirestore();
const AMIT_EMAIL = "amitmagician6@gmail.com";
const SMTP_PASSWORD = defineSecret("AMIT_SMTP_PASSWORD");
const MORNING_API_KEY = defineSecret("MORNING_API_KEY");
const MORNING_API_SECRET = defineSecret("MORNING_API_SECRET");
const secretManager = new SecretManagerServiceClient();
const DEFAULT_PAYMENT_LINKS = {
  payboxUrl: "https://links.payboxapp.com/eu0yWwH4WUb",
  bitUrl: "https://www.bitpay.co.il/app/me/72D7DFAB-5910-CEE5-7C10-2C94FF5BB45A6F9B"
};

const text = (value, fallback = "לא צוין") => String(value ?? "").trim() || fallback;
const escapeHtml = (value) => text(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;"
}[character]));

const requireAdmin = async (request) => {
  const match = String(request.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error("unauthorized");
  const decoded = await getAuth().verifyIdToken(match[1]);
  if (String(decoded.email || "").toLowerCase() !== AMIT_EMAIL) throw new Error("forbidden");
  return decoded;
};

const todayIsrael = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const morningAccessToken = async () => {
  const tokenResponse = await fetch("https://api.greeninvoice.co.il/api/v1/idp/v1/oauth/token", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: MORNING_API_KEY.value(), client_secret: MORNING_API_SECRET.value() })
  });
  const token = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !token.accessToken) throw new Error("morning-auth");
  return token.accessToken;
};
const createMorningDocument = async (payload) => {
  const accessToken = await morningAccessToken();
  const result = await fetch("https://api.greeninvoice.co.il/api/v1/documents", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(payload)
  });
  const document = await result.json().catch(() => ({}));
  if (!result.ok || !document.id) throw new Error("morning-document");
  return document;
};

const leadLines = (lead, leadId) => [
  `מספר פנייה: ${text(lead.requestNumber, leadId)}`,
  `שם: ${text(lead.name)}`,
  `טלפון: ${text(lead.phone)}`,
  `דוא״ל: ${text(lead.email)}`,
  `סוג פנייה: ${text(lead.interest)}`,
  `תאריך: ${text(lead.date)}`,
  `מקום: ${text([lead.country, lead.city].filter(Boolean).join(", "))}`,
  `משתתפים: ${text(lead.participants)}`,
  `הודעה: ${text(lead.message, "לא נכתבה הודעה")}`
];

const attributionLines = (lead) => [
  `Source: ${text(lead.source)}`,
  `Medium: ${text(lead.medium)}`,
  `Campaign: ${text(lead.campaign)}`,
  `Ad / Content: ${text(lead.content)}`,
  `Term: ${text(lead.term)}`,
  `Referrer: ${text(lead.referrer)}`,
  `Landing Page: ${text(lead.landingPage)}`,
  `Form Page: ${text(lead.formPage)}`,
  `UTM parameters: ${text(lead.utmParameters, "לא נמצאו פרמטרים")}`
];

export const notifyAmitOfLead = onDocumentCreated({
  document: "leads/{leadId}",
  region: "me-west1",
  secrets: [SMTP_PASSWORD]
}, async (event) => {
  const lead = event.data?.data();
  if (!lead) return;
  const leadId = event.params.leadId;
  const lines = leadLines(lead, leadId);
  const attribution = attributionLines(lead);
  const subject = `פנייה חדשה מהאתר: ${text(lead.interest, "פנייה כללית")}`;
  const leadRef = db.collection("leads").doc(leadId);
  const claimed = await db.runTransaction(async (transaction) => {
    const current = await transaction.get(leadRef);
    if (current.data()?.notificationAttemptId) return false;
    transaction.set(leadRef, {
      notificationAttemptId: event.id,
      notificationStatus: "sending",
      notificationStartedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return true;
  });
  if (!claimed) return;

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: AMIT_EMAIL,
      pass: SMTP_PASSWORD.value()
    }
  });

  try {
    const result = await transporter.sendMail({
      from: `"אתר עמית מיטרני" <${AMIT_EMAIL}>`,
      to: AMIT_EMAIL,
      replyTo: text(lead.email, AMIT_EMAIL),
      subject,
      text: `${lines.join("\n")}\n\nמקור הליד:\n${attribution.join("\n")}\n\nמערכת הניהול: https://amitgic.co.il/admin.html`,
      html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7"><h2>${escapeHtml(subject)}</h2>${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}<div style="margin-top:24px;padding:16px;border:1px solid #ddd;border-radius:12px;background:#f7f7f7"><h3 style="margin-top:0">מקור הליד</h3>${attribution.map((line) => `<p dir="ltr" style="text-align:left">${escapeHtml(line)}</p>`).join("")}</div><p><a href="https://amitgic.co.il/admin.html">פתיחת מערכת הניהול</a></p></div>`
    });
    await leadRef.set({
      notificationStatus: "sent",
      notificationMessageId: result.messageId || "",
      notificationAccepted: result.accepted || [],
      notificationRejected: result.rejected || [],
      notificationSentAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (error) {
    await leadRef.set({
      notificationStatus: "failed",
      notificationError: String(error?.message || error).slice(0, 500),
      notificationFailedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    throw error;
  }
});

export const buildInvitationManagementView = onDocumentCreated({
  document: "invitationManagementRequests/{requestId}",
  region: "me-west1"
}, async (event) => {
  const request = event.data?.data() || {};
  const invitationId = String(request.invitationId || "");
  const token = String(request.token || "");
  const requestRef = event.data.ref;
  if (!/^[A-Za-z0-9_-]{10,80}$/.test(invitationId) || !/^[A-Za-z0-9_-]{40,80}$/.test(token)) {
    await requestRef.set({ status: "denied", token: FieldValue.delete(), processedAt: FieldValue.serverTimestamp() }, { merge: true }); return;
  }
  try {
    const invitationRef = db.collection("invitations").doc(invitationId);
    const invitationSnap = await invitationRef.get();
    if (!invitationSnap.exists) { await requestRef.set({ status: "denied", token: FieldValue.delete(), processedAt: FieldValue.serverTimestamp() }, { merge: true }); return; }
    const invitation = invitationSnap.data();
    const actual = Buffer.from(createHash("sha256").update(token.toUpperCase()).digest("hex"));
    const expected = Buffer.from(String(invitation.managementTokenHash || ""));
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      await requestRef.set({ status: "denied", token: FieldValue.delete(), processedAt: FieldValue.serverTimestamp() }, { merge: true }); return;
    }
    let currentInvitation = invitation;
    if (request.action === "update") {
      const payload = request.payload || {};
      const celebrants = Array.isArray(payload.celebrants) ? payload.celebrants.slice(0, 20).map((item) => ({ name: text(item?.name, "").slice(0, 40), age: Number(item?.age), gender: ["male", "female"].includes(item?.gender) ? item.gender : "female" })) : [];
      const name = text(payload.name, "").slice(0, 400);
      const firstName = text(payload.firstName, currentInvitation.firstName || name).slice(0, 40);
      const age = Number(payload.age);
      const gender = ["male", "female"].includes(payload.gender) ? payload.gender : (currentInvitation.gender || "female");
      const secondName = String(payload.secondName ?? currentInvitation.secondName ?? "").trim().slice(0, 40);
      const secondAge = secondName ? Number(payload.secondAge ?? currentInvitation.secondAge ?? age) : 0;
      const secondGender = secondName && ["male", "female"].includes(payload.secondGender) ? payload.secondGender : "";
      const messageMode = ["auto", "custom"].includes(payload.messageMode) ? payload.messageMode : (currentInvitation.messageMode || "custom");
      const eventDate = text(payload.eventDate, "");
      const eventTime = text(payload.eventTime, "");
      const venueName = text(payload.venueName, "").slice(0, 80);
      const address = text(payload.address, "").slice(0, 160);
      const message = text(payload.message, "").slice(0, 500);
      const theme = ["magic", "celebration", "elegant", "rose", "ocean", "neutral"].includes(payload.theme) ? payload.theme : "magic";
      const photoData = text(payload.photoData, "");
      const clientFeatures = currentInvitation.clientCanEdit === true;
      const contacts = clientFeatures && Array.isArray(payload.contacts) ? payload.contacts.slice(0, 10).map((item) => ({ name: String(item?.name || "").trim().slice(0, 40), phone: String(item?.phone || "").trim().replace(/[^+\d\-() ]/g, "").slice(0, 30) })).filter((item) => item.name && item.phone) : [];
      const wazeEnabled = clientFeatures ? payload.wazeEnabled === true : Boolean(currentInvitation.wazeEnabled);
      if (!name || (celebrants.length && celebrants.some((item) => !item.name || !Number.isInteger(item.age) || item.age < 1 || item.age > 120)) || !Number.isInteger(age) || age < 1 || age > 120 || (secondName && (!Number.isInteger(secondAge) || secondAge < 1 || secondAge > 120)) || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !/^\d{2}:\d{2}$/.test(eventTime) || !venueName || !address || photoData.length > 430000 || (photoData && !/^data:image\/(webp|jpeg|png);base64,/.test(photoData))) throw new Error("invalid update");
      const expiry = new Date(`${eventDate}T23:59:59`);
      expiry.setDate(expiry.getDate() + 2);
      const update = { name, firstName, age, gender, secondName, secondAge, secondGender, messageMode, eventDate, eventTime, venueName, address, location: `${venueName}, ${address}`.slice(0, 250), message, theme, photoData, expiresAt: Timestamp.fromDate(expiry), updatedAt: FieldValue.serverTimestamp() };
      if (celebrants.length) update.celebrants = celebrants;
      if (clientFeatures) { update.contacts = contacts; update.wazeEnabled = wazeEnabled; }
      await invitationRef.set(update, { merge: true });
      currentInvitation = { ...invitation, ...update };
    }
    const responsesSnap = await invitationRef.collection("responses").orderBy("createdAt", "desc").get();
    const responses = responsesSnap.docs.map((entry) => {
      const item = entry.data();
      return { guestName: text(item.guestName, ""), guardianPhone: text(item.guardianPhone, ""), response: item.response, guestCount: Number(item.guestCount || 0), note: text(item.note, "") };
    });
    const publicInvitation = { name: currentInvitation.name, celebrants: currentInvitation.celebrants || [], firstName: currentInvitation.firstName || "", age: currentInvitation.age || "", gender: currentInvitation.gender || "", secondName: currentInvitation.secondName || "", secondAge: currentInvitation.secondAge || "", secondGender: currentInvitation.secondGender || "", messageMode: currentInvitation.messageMode || "custom", eventDate: currentInvitation.eventDate, eventTime: currentInvitation.eventTime, venueName: currentInvitation.venueName || "", address: currentInvitation.address || "", location: currentInvitation.location || "", message: currentInvitation.message || "", theme: currentInvitation.theme || "magic", photoData: currentInvitation.photoData || "", clientCanEdit: currentInvitation.clientCanEdit === true, contacts: currentInvitation.contacts || [], wazeEnabled: currentInvitation.wazeEnabled === true, pizzaCalculatorEnabled: currentInvitation.pizzaCalculatorEnabled === true };
    await requestRef.set({ status: "ready", token: FieldValue.delete(), payload: FieldValue.delete(), processedAt: FieldValue.serverTimestamp(), invitation: publicInvitation, responses }, { merge: true });
  } catch (error) {
    console.error("buildInvitationManagementView failed", error);
    await requestRef.set({ status: "error", token: FieldValue.delete(), processedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
});

export const invitationShare = onRequest({ region: "me-west1", cors: false }, async (request, response) => {
  const invitationId = String(request.query.id || "");
  if (!/^[A-Za-z0-9_-]{10,80}$/.test(invitationId)) { response.status(404).send("Not found"); return; }
  try {
    const snapshot = await db.collection("invitations").doc(invitationId).get();
    if (!snapshot.exists) { response.status(404).send("Not found"); return; }
    const invitation = snapshot.data();
    const expiry = invitation.expiresAt?.toDate?.();
    if (invitation.status !== "active" || (expiry && expiry < new Date())) { response.status(410).send("Invitation expired"); return; }
    if (request.query.image === "1") {
      const match = String(invitation.photoData || "").match(/^data:(image\/(?:webp|jpeg|png));base64,(.+)$/);
      if (match) { response.set("Content-Type", match[1]); response.set("Cache-Control", "public, max-age=3600"); response.send(Buffer.from(match[2], "base64")); return; }
      response.redirect(302, "https://amitgic.co.il/assets/optimized/hero-amit-1200.webp"); return;
    }
    const guestUrl = `https://amitgic.co.il/digital-invitation.html?id=${encodeURIComponent(invitationId)}`;
    const functionUrl = `https://me-west1-amit-mitrani-crm.cloudfunctions.net/invitationShare?id=${encodeURIComponent(invitationId)}`;
    const title = `יום ההולדת של ${text(invitation.name, "החוגג/ת")} 🎉`;
    const description = "מוזמנים לחגוג איתנו! לחצו לצפייה בהזמנה ולאישור הגעה.";
    const imageUrl = `${functionUrl}&image=1`;
    response.set("Content-Type", "text/html; charset=utf-8");
    response.set("Cache-Control", "public, max-age=300");
    response.status(200).send(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#08070d"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:image" content="${escapeHtml(imageUrl)}"><meta property="og:url" content="${escapeHtml(functionUrl)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"><meta name="twitter:image" content="${escapeHtml(imageUrl)}"><meta http-equiv="refresh" content="0;url=${escapeHtml(guestUrl)}"><style>html,body{min-height:100vh;min-height:100svh;margin:0;background:#08070d;color:#f8f6fb;font-family:Arial,sans-serif}body{display:grid;place-content:center;justify-items:center;gap:14px;text-align:center}.brand{font-size:25px;font-weight:900}.brand b,a{color:#f0c467}.spinner{width:38px;height:38px;border:3px solid rgba(240,196,103,.22);border-top-color:#f0c467;border-radius:50%;animation:spin .75s linear infinite}p{margin:0;color:#bdb7c8}@keyframes spin{to{transform:rotate(360deg)}}</style></head><body><span class="brand">עמית <b>מיטרני</b></span><i class="spinner" aria-hidden="true"></i><p><a href="${escapeHtml(guestUrl)}">פותחים את ההזמנה…</a></p><script>location.replace(${JSON.stringify(guestUrl)})</script></body></html>`);
  } catch (error) {
    console.error("invitationShare failed", error);
    response.status(500).send("Unable to load invitation");
  }
});

export const submitInvitationRequest = onRequest({ region: "me-west1", cors: true }, async (request, response) => {
  if (request.method !== "POST") { response.status(405).json({ message: "Method not allowed" }); return; }
  const body = request.body || {};
  const token = String(body.access || "");
  const tokenHash = createHash("sha256").update(token.toUpperCase()).digest("hex");
  const children = Array.isArray(body.children) ? body.children.slice(0, 4).map((child) => ({
    name: text(child?.name, "").slice(0, 40), age: Number(child?.age), gender: ["male", "female"].includes(child?.gender) ? child.gender : ""
  })) : [];
  const eventDate = text(body.eventDate, ""), eventTime = text(body.eventTime, ""), style = text(body.style, "").slice(0, 80);
  const city = text(body.city, "").slice(0, 60), street = text(body.street, "").slice(0, 80), houseNumber = text(body.houseNumber, "").slice(0, 12), venueType = text(body.venueType, "").slice(0, 30), venueDetails = text(body.venueDetails, "").slice(0, 120), contactName = text(body.contactName, "").slice(0, 50), contactPhone = text(body.contactPhone, "").replace(/[^+\d\-() ]/g, "").slice(0, 30);
  const images = Array.isArray(body.images) ? body.images.slice(0, 12) : [];
  const photoMode = body.photoMode === "shared" ? "shared" : "individual";
  const hasOnePhotoPerChild = images.length === children.length && images.every((image, index) => Number(image?.childIndex) === index);
  const hasSharedPhotos = images.length >= 1 && images.length <= 8 && images.every(image => image?.childIndex === null || image?.childIndex === undefined);
  const originalPayloadSize = images.reduce((total, image) => total + String(image?.original?.data || "").length, 0);
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token) || !children.length || children.some((child) => !child.name || !Number.isInteger(child.age) || child.age < 1 || child.age > 120 || !child.gender) || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !/^\d{2}:\d{2}$/.test(eventTime) || !city || !street || !houseNumber || !venueType || !contactName || contactPhone.length < 7 || originalPayloadSize > 25200000 || (photoMode === "individual" ? !hasOnePhotoPerChild : !hasSharedPhotos)) { response.status(400).json({ message: "יש לצרף תמונות בהתאם לבחירה ופרטים מלאים" }); return; }
  const accessRef = db.collection("invitationRequestAccess").doc(tokenHash);
  try {
    const access = await accessRef.get();
    if (!access.exists || access.data()?.active !== true || access.data()?.used === true || access.data()?.expiresAt?.toDate?.() <= new Date()) { response.status(403).json({ message: "הקישור אינו תקין או שכבר נעשה בו שימוש" }); return; }
    const requestRef = db.collection("invitationRequests").doc();
    const storedImages = [];
    for (let index = 0; index < images.length; index += 1) {
      const image = images[index] || {}, encoded = String(image.data || ""), contentType = String(image.contentType || "");
      const childIndex = Number.isInteger(image.childIndex) && image.childIndex >= 0 && image.childIndex < children.length ? image.childIndex : null;
      const imageLimit = /^image\/(heic|heif)$/.test(contentType) ? 4200000 : 420000;
      if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(contentType) || !/^[A-Za-z0-9+/=]+$/.test(encoded) || encoded.length > imageLimit) throw new Error("image");
      const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : contentType === "image/heic" ? "heic" : contentType === "image/heif" ? "heif" : "jpg";
      const path = `invitation-request-media/${requestRef.id}/${index}.${extension}`;
      const original = image.original || {}, originalData = String(original.data || ""), originalContentType = String(original.contentType || ""), originalName = text(original.name, image.name || "תמונה").slice(0, 100);
      const originalExtension = originalContentType === "image/png" ? "png" : originalContentType === "image/webp" ? "webp" : originalContentType === "image/heic" ? "heic" : originalContentType === "image/heif" ? "heif" : "jpg";
      if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(originalContentType) || !/^[A-Za-z0-9+/=]+$/.test(originalData) || originalData.length > 14000000) throw new Error("original-image");
      const originalPath = `invitation-request-media/${requestRef.id}/original-${index}.${originalExtension}`;
      await getStorage().bucket().file(path).save(Buffer.from(encoded, "base64"), { metadata: { contentType } });
      await getStorage().bucket().file(originalPath).save(Buffer.from(originalData, "base64"), { metadata: { contentType: originalContentType } });
      storedImages.push({ path, childIndex, contentType, name: text(image.name, "תמונה").slice(0, 100), originalPath, originalContentType, originalName });
    }
    await db.runTransaction(async transaction => {
      const fresh = await transaction.get(accessRef), data = fresh.data();
      if (!fresh.exists || data?.active !== true || data?.used === true || data?.expiresAt?.toDate?.() <= new Date()) throw new Error("access");
      transaction.update(accessRef, { used: true, usedAt: FieldValue.serverTimestamp(), requestId: requestRef.id });
      transaction.set(requestRef, { status: "pending", children, images: storedImages, photoMode, eventDate, eventTime, style, city, street, houseNumber, venueType, venueDetails, contactName, contactPhone, createdAt: FieldValue.serverTimestamp() });
    });
    response.status(201).json({ ok: true });
  } catch (error) {
    console.error("submitInvitationRequest failed", error);
    response.status(400).json({ message: "לא הצלחנו לשלוח את הבקשה. נסו שוב." });
  }
});

// Credentials arrive only over HTTPS, go straight to Secret Manager, and are
// never returned, stored in Firestore, or included in logs.
export const configureMorningSecrets = onRequest({
  region: "me-west1",
  cors: ["https://amitgic.co.il", "https://www.amitgic.co.il"]
}, async (request, response) => {
  if (request.method !== "POST") { response.status(405).json({ message: "Method not allowed" }); return; }
  try {
    const admin = await requireAdmin(request);
    const apiKey = String(request.body?.apiKey || "").trim();
    const apiSecret = String(request.body?.apiSecret || "").trim();
    if (apiKey.length < 12 || apiKey.length > 512 || apiSecret.length < 12 || apiSecret.length > 512) {
      response.status(400).json({ message: "פרטי Morning אינם מלאים" }); return;
    }
    const projectId = process.env.GCLOUD_PROJECT || "amit-mitrani-crm";
    await Promise.all([
      secretManager.addSecretVersion({ parent: `projects/${projectId}/secrets/MORNING_API_KEY`, payload: { data: Buffer.from(apiKey) } }),
      secretManager.addSecretVersion({ parent: `projects/${projectId}/secrets/MORNING_API_SECRET`, payload: { data: Buffer.from(apiSecret) } })
    ]);
    await db.collection("integrationSettings").doc("morning").set({
      configured: true,
      configuredAt: FieldValue.serverTimestamp(),
      configuredBy: String(admin.email || "")
    }, { merge: true });
    response.status(200).json({ ok: true });
  } catch (error) {
    const message = String(error?.message || "");
    if (message === "unauthorized" || message === "forbidden") { response.status(403).json({ message: "גישה למנהל בלבד" }); return; }
    console.error("configureMorningSecrets failed", { message: message.slice(0, 180) });
    response.status(500).json({ message: "לא הצלחנו לשמור את החיבור. נסה שוב." });
  }
});

export const createPaymentRequest = onRequest({ region: "me-west1", cors: ["https://amitgic.co.il", "https://www.amitgic.co.il"] }, async (request, response) => {
  if (request.method !== "POST") { response.status(405).json({ message: "Method not allowed" }); return; }
  try {
    await requireAdmin(request);
    const customerName = text(request.body?.customerName, "").slice(0, 80);
    const customerPhone = text(request.body?.customerPhone, "").replace(/[^+\d\-() ]/g, "").slice(0, 30);
    const description = text(request.body?.description, "תשלום עבור מופע").slice(0, 180);
    const billingFlow = request.body?.billingFlow === "invoice_then_receipt" ? "invoice_then_receipt" : "invoice_receipt_after_payment";
    const amount = Math.round(Number(request.body?.amount) * 100);
    if (!customerName || !Number.isInteger(amount) || amount < 100 || amount > 100000000) { response.status(400).json({ message: "יש למלא שם וסכום תקין" }); return; }
    const methods = { ...DEFAULT_PAYMENT_LINKS, ...((await db.collection("integrationSettings").doc("paymentMethods").get()).data() || {}) };
    const paymentMethods = {
      bitUrl: text(methods.bitUrl, "").slice(0, 500), bitPhone: text(methods.bitPhone, "").slice(0, 30), payboxUrl: text(methods.payboxUrl, "").slice(0, 500),
      bankName: text(methods.bankName, "").slice(0, 80), bankBranch: text(methods.bankBranch, "").slice(0, 30),
      bankAccount: text(methods.bankAccount, "").slice(0, 40), bankHolder: text(methods.bankHolder, "").slice(0, 80)
    };
    if (!paymentMethods.bitUrl && !paymentMethods.bitPhone && !paymentMethods.payboxUrl && !paymentMethods.bankAccount) { response.status(400).json({ message: "יש להגדיר קודם אמצעי תשלום במסך Morning" }); return; }
    const rawToken = randomBytes(32).toString("base64url"), tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const ref = db.collection("paymentRequests").doc();
    await ref.set({ customerName, customerPhone, description, amount, billingFlow, paymentMethods, tokenHash, status: "pending", createdAt: FieldValue.serverTimestamp() });
    response.status(201).json({ ok: true, id: ref.id, url: `https://amitgic.co.il/payment-request.html?t=${encodeURIComponent(rawToken)}` });
  } catch (error) {
    const message = String(error?.message || "");
    if (message === "unauthorized" || message === "forbidden") { response.status(403).json({ message: "גישה למנהל בלבד" }); return; }
    console.error("createPaymentRequest failed", { message: message.slice(0, 180) });
    response.status(500).json({ message: "לא הצלחנו להכין את דרישת התשלום." });
  }
});

export const getPaymentRequest = onRequest({ region: "me-west1", cors: true }, async (request, response) => {
  if (request.method !== "GET") { response.status(405).json({ message: "Method not allowed" }); return; }
  const token = String(request.query.t || "");
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) { response.status(404).json({ message: "הקישור אינו תקין" }); return; }
  try {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const snapshot = await db.collection("paymentRequests").where("tokenHash", "==", tokenHash).limit(1).get();
    if (snapshot.empty) { response.status(404).json({ message: "הקישור אינו תקין" }); return; }
    const payment = snapshot.docs[0].data();
    response.status(200).json({ description: text(payment.description), amount: Number(payment.amount || 0), status: text(payment.status), paymentMethods: payment.paymentMethods || {} });
  } catch (error) {
    console.error("getPaymentRequest failed", { message: String(error?.message || "").slice(0, 180) });
    response.status(500).json({ message: "לא הצלחנו לטעון את דרישת התשלום." });
  }
});

export const issuePaymentDocument = onRequest({
  region: "me-west1",
  cors: ["https://amitgic.co.il", "https://www.amitgic.co.il"],
  secrets: [MORNING_API_KEY, MORNING_API_SECRET]
}, async (request, response) => {
  if (request.method !== "POST") { response.status(405).json({ message: "Method not allowed" }); return; }
  let paymentRef, attemptId;
  try {
    await requireAdmin(request);
    const paymentId = String(request.body?.paymentId || ""), action = String(request.body?.action || ""), paymentMethod = String(request.body?.paymentMethod || "");
    if (!/^[A-Za-z0-9_-]{10,80}$/.test(paymentId) || !["invoice", "payment-document"].includes(action) || (action === "payment-document" && !["paybox", "bit", "bank"].includes(paymentMethod)) || request.body?.confirmed !== true) { response.status(400).json({ message: "פרטי אישור התשלום אינם תקינים" }); return; }
    paymentRef = db.collection("paymentRequests").doc(paymentId); attemptId = randomBytes(16).toString("hex");
    const payment = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(paymentRef);
      if (!snapshot.exists) throw new Error("missing-payment");
      const current = snapshot.data(), flow = current.billingFlow || "invoice_then_receipt";
      const hasInvoice = Boolean(current.invoiceDocument?.id), hasPaymentDocument = Boolean(current.paymentDocument?.id);
      if (current.documentLock || (action === "invoice" && (flow !== "invoice_then_receipt" || hasInvoice)) || (action === "payment-document" && (hasPaymentDocument || (flow === "invoice_then_receipt" && !hasInvoice)))) throw new Error("already-issued");
      transaction.update(paymentRef, { documentLock: attemptId, documentLockAt: FieldValue.serverTimestamp() });
      return current;
    });
    const amount = Number(payment.amount || 0) / 100;
    const income = [{ description: text(payment.description, "תשלום עבור מופע"), quantity: 1, price: amount, currency: "ILS", vatType: 0 }];
    const client = { name: text(payment.customerName, "לקוח"), add: true };
    if (payment.customerPhone) { client.phone = String(payment.customerPhone); client.mobile = String(payment.customerPhone); }
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(payment.customerEmail || ""))) client.emails = [String(payment.customerEmail)];
    const paymentRow = paymentMethod === "bank" ? { date: todayIsrael(), type: 4, price: amount, currency: "ILS" } : { date: todayIsrael(), type: 10, appType: paymentMethod === "bit" ? 1 : 3, accountId: paymentMethod === "bit" ? "Bit" : "PayBox", price: amount, currency: "ILS" };
    const flow = payment.billingFlow || "invoice_then_receipt";
    let documentPayload, documentField, label;
    if (action === "invoice") {
      documentPayload = { type: 300, lang: "he", currency: "ILS", vatType: 0, description: text(payment.description, "תשלום עבור מופע"), client, income };
      documentField = "invoiceDocument"; label = "חשבונית עסקה";
    } else if (flow === "invoice_then_receipt") {
      documentPayload = { type: 400, lang: "he", currency: "ILS", vatType: 0, description: text(payment.description, "תשלום עבור מופע"), client, income, payment: [paymentRow], linkedDocumentIds: [payment.invoiceDocument.id], linkType: "link" };
      documentField = "paymentDocument"; label = "קבלה";
    } else {
      documentPayload = { type: 320, lang: "he", currency: "ILS", vatType: 0, description: text(payment.description, "תשלום עבור מופע"), client, income, payment: [paymentRow] };
      documentField = "paymentDocument"; label = "חשבונית מס/קבלה";
    }
    const document = await createMorningDocument(documentPayload);
    const documentData = { id: document.id, number: Number(document.number || 0), url: String(document.url?.he || document.url?.origin || ""), type: Number(document.type || documentPayload.type), issuedAt: FieldValue.serverTimestamp(), paymentMethod: action === "invoice" ? "" : paymentMethod };
    await paymentRef.update({ [documentField]: documentData, documentLock: FieldValue.delete(), documentLockAt: FieldValue.delete(), status: action === "invoice" ? "awaiting-payment" : "paid", updatedAt: FieldValue.serverTimestamp() });
    response.status(201).json({ ok: true, label, number: documentData.number, url: documentData.url });
  } catch (error) {
    if (paymentRef && attemptId) await paymentRef.update({ documentLock: FieldValue.delete(), documentLockAt: FieldValue.delete(), documentError: String(error?.message || "").slice(0, 80), updatedAt: FieldValue.serverTimestamp() }).catch(() => {});
    const message = String(error?.message || "");
    if (message === "unauthorized" || message === "forbidden") { response.status(403).json({ message: "גישה למנהל בלבד" }); return; }
    if (message === "already-issued") { response.status(409).json({ message: "מסמך כבר נוצר או שנמצא בתהליך יצירה" }); return; }
    if (message === "morning-auth") { response.status(502).json({ message: "לא הצלחנו להתחבר ל‑Morning. בדוק את פרטי החיבור." }); return; }
    if (message === "morning-document") { response.status(502).json({ message: "Morning לא הצליחה ליצור את המסמך. לא נוצר מסמך חדש." }); return; }
    console.error("issuePaymentDocument failed", { message: message.slice(0, 180) });
    response.status(500).json({ message: "לא הצלחנו ליצור את המסמך." });
  }
});

export const deletePaymentRequest = onRequest({ region: "me-west1", cors: ["https://amitgic.co.il", "https://www.amitgic.co.il"] }, async (request, response) => {
  if (request.method !== "POST") { response.status(405).json({ message: "Method not allowed" }); return; }
  try {
    await requireAdmin(request);
    const paymentId = String(request.body?.paymentId || "");
    if (!/^[A-Za-z0-9_-]{10,80}$/.test(paymentId)) { response.status(400).json({ message: "דרישת התשלום אינה תקינה" }); return; }
    const paymentRef = db.collection("paymentRequests").doc(paymentId);
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(paymentRef);
      if (!snapshot.exists) throw new Error("missing-payment");
      const payment = snapshot.data();
      if (payment.invoiceDocument?.id || payment.paymentDocument?.id || payment.documentLock) throw new Error("document-exists");
      transaction.delete(paymentRef);
    });
    response.status(200).json({ ok: true });
  } catch (error) {
    const message = String(error?.message || "");
    if (message === "unauthorized" || message === "forbidden") { response.status(403).json({ message: "גישה למנהל בלבד" }); return; }
    if (message === "document-exists") { response.status(409).json({ message: "אי אפשר למחוק דרישה שכבר הופק עבורה מסמך. צריך לטפל במסמך בתוך Morning." }); return; }
    if (message === "missing-payment") { response.status(404).json({ message: "דרישת התשלום כבר נמחקה" }); return; }
    console.error("deletePaymentRequest failed", { message: message.slice(0, 180) });
    response.status(500).json({ message: "לא הצלחנו למחוק את דרישת התשלום." });
  }
});

export const savePaymentInvoiceEmail = onRequest({ region: "me-west1", cors: true }, async (request, response) => {
  if (request.method !== "POST") { response.status(405).json({ message: "Method not allowed" }); return; }
  const token = String(request.body?.t || ""), email = String(request.body?.email || "").trim().toLowerCase();
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) { response.status(400).json({ message: "יש להזין כתובת מייל תקינה" }); return; }
  try {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const snapshot = await db.collection("paymentRequests").where("tokenHash", "==", tokenHash).limit(1).get();
    if (snapshot.empty) { response.status(404).json({ message: "הקישור אינו תקין" }); return; }
    const ref = snapshot.docs[0].ref, payment = snapshot.docs[0].data();
    if (payment.paymentDocument?.id) { response.status(409).json({ message: "המסמך כבר הופק" }); return; }
    await ref.update({ customerEmail: email, emailRequestedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    response.status(200).json({ ok: true });
  } catch (error) {
    console.error("savePaymentInvoiceEmail failed", { message: String(error?.message || "").slice(0, 180) });
    response.status(500).json({ message: "לא הצלחנו לשמור את כתובת המייל" });
  }
});
