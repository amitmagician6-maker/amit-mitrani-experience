(() => {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };

  const scriptUrl = document.currentScript?.src
    || [...document.scripts].find((script) => /\/assets\/analytics\.js(?:$|\?)/.test(script.src))?.src;
  const assetBase = scriptUrl ? new URL(".", scriptUrl) : new URL("/assets/", location.origin);
  const trim = (value, limit = 200) => String(value || "").trim().slice(0, limit);
  const pagePath = trim(location.pathname || "/", 300);
  const language = trim(document.documentElement.lang?.split("-")[0] || "he", 8);
  const params = new URLSearchParams(location.search);
  const referrerHost = (() => {
    try { return new URL(document.referrer).hostname.replace(/^www\./, ""); } catch { return ""; }
  })();
  const source = trim(params.get("utm_source") || (params.has("gclid") ? "Google Ads" : params.has("fbclid") ? "Meta Ads" : params.has("ttclid") ? "TikTok Ads" : referrerHost || "Direct"), 100);
  const medium = trim(params.get("utm_medium") || (params.has("gclid") ? "cpc" : params.has("fbclid") || params.has("ttclid") ? "paid_social" : referrerHost ? "referral" : "none"), 100);
  let firestorePromise;
  const recentEvents = new Map();
  const startedForms = new WeakSet();
  const seenIframeVideos = new Set();

  const videoIdFromUrl = (value) => {
    try {
      const url = new URL(value, location.href);
      if (url.hostname === "youtu.be") return trim(url.pathname.split("/").filter(Boolean)[0], 32);
      if (/youtube(?:-nocookie)?\.com$/.test(url.hostname.replace(/^www\./, ""))) {
        return trim(url.searchParams.get("v") || url.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/)?.[1], 32);
      }
    } catch {}
    return "";
  };

  const writeAggregateEvent = async (eventType, details = {}) => {
    if (/\/admin(?:\.html)?$/.test(location.pathname)) return;
    try {
      firestorePromise ||= Promise.all([
        import(new URL("firebase-config.js", assetBase).href),
        import("https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js")
      ]);
      const [{ db }, { addDoc, collection, serverTimestamp }] = await firestorePromise;
      await addDoc(collection(db, "analyticsEvents"), {
        eventType: trim(eventType, 40),
        pagePath,
        pageTitle: trim(document.title, 200),
        target: trim(details.target, 300),
        targetLabel: trim(details.targetLabel, 160),
        videoId: trim(details.videoId, 32),
        language,
        source,
        medium,
        campaign: trim(params.get("utm_campaign"), 160),
        content: trim(params.get("utm_content"), 160),
        createdAt: serverTimestamp()
      });
    } catch (error) {
      console.warn("Aggregate analytics event was not saved.", error);
    }
  };

  const send = (name, parameters = {}, dedupeKey = "") => {
    const now = Date.now();
    const key = `${name}:${dedupeKey || pagePath}`;
    if (now - (recentEvents.get(key) || 0) < 1000) return false;
    recentEvents.set(key, now);
    window.gtag("event", name, {
      page_path: pagePath,
      page_title: document.title,
      ...parameters
    });
    return true;
  };

  writeAggregateEvent("page_view");

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link) return;
    const href = link.getAttribute("href") || "";
    const linkDomain = (() => {
      try { return new URL(link.href, location.href).hostname.replace(/^www\./, ""); } catch { return ""; }
    })();
    const buttonLocation = trim(link.closest("header,nav,main,section,footer,dialog")?.tagName.toLowerCase() || "page", 40);

    if (/^(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)/i.test(href)) {
      const name = link.id === "order-whatsapp" ? "booking_whatsapp_click" : "whatsapp_click";
      if (send(name, { link_domain: linkDomain, button_location: buttonLocation, event_category: "lead" }, link.id || linkDomain)) {
        writeAggregateEvent(name, { target: "whatsapp", targetLabel: buttonLocation });
      }
    } else if (/^tel:/i.test(href)) {
      if (send("phone_click", { button_location: buttonLocation, event_category: "lead" }, buttonLocation)) {
        writeAggregateEvent("phone_click", { target: "phone", targetLabel: buttonLocation });
      }
    } else if (/^mailto:/i.test(href)) {
      if (send("email_click", { button_location: buttonLocation, event_category: "lead" }, buttonLocation)) {
        writeAggregateEvent("email_click", { target: "email", targetLabel: buttonLocation });
      }
    } else {
      const videoId = videoIdFromUrl(link.href);
      if (videoId) {
        if (send("video_start", { video_id: videoId, video_title: trim(link.getAttribute("aria-label") || link.textContent, 160), event_category: "engagement" }, videoId)) {
          writeAggregateEvent("video_start", { target: `youtube:${videoId}`, targetLabel: "YouTube", videoId });
        }
      } else if (link.target === "_blank" && /^https?:/i.test(link.href)) {
        const reviewContext = link.closest("[class*='review'],[class*='testimonial'],[data-review]");
        const name = reviewContext ? "review_source_click" : "outbound_click";
        if (send(name, { link_domain: linkDomain, button_location: buttonLocation, event_category: reviewContext ? "social_proof" : "outbound" }, linkDomain)) {
          writeAggregateEvent(name, { target: linkDomain, targetLabel: buttonLocation });
        }
      }
    }
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const label = trim(button.textContent || button.getAttribute("aria-label"), 160);
    const buttonLocation = trim(button.closest("header,nav,main,section,footer,dialog")?.tagName.toLowerCase() || "page", 40);
    if (button.matches("[data-commerce-open]")) {
      if (send("booking_form_open", { button_location: buttonLocation, form_name: "booking_request", event_category: "lead" }, buttonLocation)) {
        writeAggregateEvent("booking_form_open", { target: "booking_request", targetLabel: buttonLocation });
      }
    } else if (button.matches(".youtube-click-load, .adult-video-stories__play")) {
      const fallback = button.parentElement?.querySelector("a[href*='youtu']");
      const videoId = trim(button.dataset.youtubeId || button.dataset.videoId || videoIdFromUrl(fallback?.href), 32);
      if (videoId && send("video_start", { video_id: videoId, video_title: trim(button.getAttribute("aria-label"), 160), event_category: "engagement" }, videoId)) {
        seenIframeVideos.add(videoId);
        writeAggregateEvent("video_start", { target: `youtube:${videoId}`, targetLabel: "YouTube", videoId });
      }
    }
  });

  const markFormStart = (event) => {
    const form = event.target?.closest?.("form");
    if (!(form instanceof HTMLFormElement) || startedForms.has(form) || form.closest("#admin-main")) return;
    startedForms.add(form);
    const formName = trim(form.getAttribute("name") || form.id || "unknown", 80);
    send("booking_form_start", { form_name: formName, event_category: "lead" }, formName);
    writeAggregateEvent("booking_form_start", { target: formName, targetLabel: "form" });
  };
  document.addEventListener("input", markFormStart, { capture: true, passive: true });
  document.addEventListener("change", markFormStart, { capture: true, passive: true });

  document.addEventListener("amit:lead-saved", (event) => {
    const formName = trim(event.detail?.formName || "lead_form", 80);
    const leadId = trim(event.detail?.leadId, 80);
    if (send("generate_lead", { form_name: formName, event_category: "lead" }, leadId || formName)) {
      writeAggregateEvent("generate_lead", { target: formName, targetLabel: "confirmed" });
    }
  });

  window.addEventListener("blur", () => {
    window.setTimeout(() => {
      const frame = document.activeElement;
      if (!(frame instanceof HTMLIFrameElement)) return;
      const videoId = videoIdFromUrl(frame.src);
      if (!videoId || seenIframeVideos.has(videoId)) return;
      seenIframeVideos.add(videoId);
      if (send("video_start", { video_id: videoId, video_title: trim(frame.title || "סרטון YouTube", 160), event_category: "engagement" }, videoId)) {
        writeAggregateEvent("video_start", { target: `youtube:${videoId}`, targetLabel: "YouTube", videoId });
      }
    }, 0);
  });

  const scrollMarks = new Set();
  window.addEventListener("scroll", () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    if (max <= 0) return;
    const percent = Math.round((scrollY / max) * 100);
    [50, 90].forEach((mark) => {
      if (percent >= mark && !scrollMarks.has(mark)) {
        scrollMarks.add(mark);
        writeAggregateEvent("scroll_depth", { target: String(mark), targetLabel: `${mark}%` });
      }
    });
  }, { passive: true });
})();
