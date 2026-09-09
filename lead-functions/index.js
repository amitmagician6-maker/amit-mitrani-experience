import { initializeApp } from "firebase-admin/app";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { createHash, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";

initializeApp();
const db = getFirestore();
const AMIT_EMAIL = "amitmagician6@gmail.com";
const SMTP_PASSWORD = defineSecret("AMIT_SMTP_PASSWORD");

const text = (value, fallback = "לא צוין") => String(value ?? "").trim() || fallback;
const escapeHtml = (value) => text(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;"
}[character]));

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
      if (!name || (celebrants.length && celebrants.some((item) => !item.name || !Number.isInteger(item.age) || item.age < 1 || item.age > 120)) || !Number.isInteger(age) || age < 1 || age > 120 || (secondName && (!Number.isInteger(secondAge) || secondAge < 1 || secondAge > 120)) || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !/^\d{2}:\d{2}$/.test(eventTime) || !venueName || !address || photoData.length > 430000 || (photoData && !/^data:image\/(webp|jpeg|png);base64,/.test(photoData))) throw new Error("invalid update");
      const expiry = new Date(`${eventDate}T23:59:59`);
      expiry.setDate(expiry.getDate() + 2);
      const update = { name, firstName, age, gender, secondName, secondAge, secondGender, messageMode, eventDate, eventTime, venueName, address, location: `${venueName}, ${address}`.slice(0, 250), message, theme, photoData, expiresAt: Timestamp.fromDate(expiry), updatedAt: FieldValue.serverTimestamp() };
      if (celebrants.length) update.celebrants = celebrants;
      await invitationRef.set(update, { merge: true });
      currentInvitation = { ...invitation, ...update };
    }
    const responsesSnap = await invitationRef.collection("responses").orderBy("createdAt", "desc").get();
    const responses = responsesSnap.docs.map((entry) => {
      const item = entry.data();
      return { guestName: text(item.guestName, ""), guardianPhone: text(item.guardianPhone, ""), response: item.response, guestCount: Number(item.guestCount || 0), note: text(item.note, "") };
    });
    const publicInvitation = { name: currentInvitation.name, celebrants: currentInvitation.celebrants || [], firstName: currentInvitation.firstName || "", age: currentInvitation.age || "", gender: currentInvitation.gender || "", secondName: currentInvitation.secondName || "", secondAge: currentInvitation.secondAge || "", secondGender: currentInvitation.secondGender || "", messageMode: currentInvitation.messageMode || "custom", eventDate: currentInvitation.eventDate, eventTime: currentInvitation.eventTime, venueName: currentInvitation.venueName || "", address: currentInvitation.address || "", location: currentInvitation.location || "", message: currentInvitation.message || "", theme: currentInvitation.theme || "magic", photoData: currentInvitation.photoData || "" };
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
    response.status(200).send(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:image" content="${escapeHtml(imageUrl)}"><meta property="og:url" content="${escapeHtml(functionUrl)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"><meta name="twitter:image" content="${escapeHtml(imageUrl)}"><meta http-equiv="refresh" content="0;url=${escapeHtml(guestUrl)}"></head><body><p><a href="${escapeHtml(guestUrl)}">פתיחת ההזמנה</a></p><script>location.replace(${JSON.stringify(guestUrl)})</script></body></html>`);
  } catch (error) {
    console.error("invitationShare failed", error);
    response.status(500).send("Unable to load invitation");
  }
});
