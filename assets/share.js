(() => {
  const scriptBase = document.currentScript?.src
    || [...document.scripts].find((script) => /\/assets\/share\.js(?:$|\?)/.test(script.src))?.src;
  if (scriptBase) {
    import(new URL("cms-runtime.js?v=3", scriptBase).href).catch((error) => {
      console.warn("Site content editor runtime could not be loaded.", error);
      document.documentElement.dataset.cmsError = error?.message || "load-failed";
    });
    import(new URL("lead-capture.js?v=3", scriptBase).href).catch((error) => {
      console.warn("Site CRM could not be loaded.", error);
      document.documentElement.dataset.crmError = error?.message || "load-failed";
    });
  }

  const copy = {
    he: {
      trigger: "שיתוף",
      directory: "כל העמודים",
      title: "לשתף את העמוד",
      description: "שלחו את העמוד המדויק למי שייהנה ממנו.",
      device: "שיתוף במכשיר",
      whatsapp: "שיתוף בוואטסאפ",
      link: "העתקת קישור",
      copied: "הקישור הועתק.",
      failed: "לא הצלחנו להעתיק. אפשר לסמן את הכתובת בשורת הדפדפן.",
      close: "סגירה"
    },
    en: {
      trigger: "Share",
      directory: "All pages",
      title: "Share this page",
      description: "Send this exact page to someone planning an event.",
      device: "Share from this device",
      whatsapp: "Share on WhatsApp",
      link: "Copy link",
      copied: "Link copied.",
      failed: "The link could not be copied. You can copy it from the address bar.",
      close: "Close"
    },
    fr: {
      trigger: "Partager",
      directory: "Toutes les pages",
      title: "Partager cette page",
      description: "Envoyez cette page précise à une personne qui prépare un événement.",
      device: "Partager depuis cet appareil",
      whatsapp: "Partager sur WhatsApp",
      link: "Copier le lien",
      copied: "Lien copié.",
      failed: "Le lien n’a pas pu être copié. Vous pouvez le copier dans la barre d’adresse.",
      close: "Fermer"
    },
    ru: {
      trigger: "Поделиться",
      directory: "Все страницы",
      title: "Поделиться страницей",
      description: "Отправьте эту страницу тому, кто планирует мероприятие.",
      device: "Поделиться с устройства",
      whatsapp: "Отправить в WhatsApp",
      link: "Копировать ссылку",
      copied: "Ссылка скопирована.",
      failed: "Скопировать ссылку не удалось. Её можно скопировать из адресной строки.",
      close: "Закрыть"
    }
  };

  const language = document.documentElement.lang?.split("-")[0] || "he";
  const text = copy[language] || copy.en;
  const socialTitle = {
    he: "עקבו אחרי עמית מיטרני",
    en: "Follow Amit Mitrani",
    fr: "Suivez Amit Mitrani",
    ru: "Подписывайтесь на Амита Митрани"
  }[language] || "Follow Amit Mitrani";
  const socialLabels = {
    he: { instagram: "עמית מיטרני באינסטגרם", facebook: "עמית מיטרני בפייסבוק", youtube: "עמית מיטרני ביוטיוב", tiktok: "עמית מיטרני בטיקטוק" },
    en: { instagram: "Amit Mitrani on Instagram", facebook: "Amit Mitrani on Facebook", youtube: "Amit Mitrani on YouTube", tiktok: "Amit Mitrani on TikTok" },
    fr: { instagram: "Amit Mitrani sur Instagram", facebook: "Amit Mitrani sur Facebook", youtube: "Amit Mitrani sur YouTube", tiktok: "Amit Mitrani sur TikTok" },
    ru: { instagram: "Амит Митрани в Instagram", facebook: "Амит Митрани в Facebook", youtube: "Амит Митрани на YouTube", tiktok: "Амит Митрани в TikTok" }
  }[language] || null;
  const labels = socialLabels || {
    instagram: "Amit Mitrani on Instagram",
    facebook: "Amit Mitrani on Facebook",
    youtube: "Amit Mitrani on YouTube",
    tiktok: "Amit Mitrani on TikTok"
  };
  const socialIconsMarkup = `
    <a class="site-social-link site-social-link--instagram" href="https://www.instagram.com/amitmiterani_magic/" target="_blank" rel="noopener" aria-label="${labels.instagram}" title="Instagram">
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="4"></circle><circle cx="17.4" cy="6.7" r="1"></circle></svg>
    </a>
    <a class="site-social-link site-social-link--facebook" href="https://www.facebook.com/amitgic/" target="_blank" rel="noopener" aria-label="${labels.facebook}" title="Facebook">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 8h3V4h-3c-3.3 0-5 2-5 5v2H6v4h3v7h4v-7h3.5l.5-4h-4V9c0-.7.3-1 1-1z"></path></svg>
    </a>
    <a class="site-social-link site-social-link--youtube" href="https://www.youtube.com/@amitmagician6" target="_blank" rel="noopener" aria-label="${labels.youtube}" title="YouTube">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.6 7.2a2.8 2.8 0 0 0-2-2C17.8 4.7 12 4.7 12 4.7s-5.8 0-7.6.5a2.8 2.8 0 0 0-2 2A29 29 0 0 0 2 12a29 29 0 0 0 .4 4.8 2.8 2.8 0 0 0 2 2c1.8.5 7.6.5 7.6.5s5.8 0 7.6-.5a2.8 2.8 0 0 0 2-2A29 29 0 0 0 22 12a29 29 0 0 0-.4-4.8zM10 15.2V8.8l5.5 3.2z"></path></svg>
    </a>
    <a class="site-social-link site-social-link--tiktok" href="https://www.tiktok.com/@amitmagic" target="_blank" rel="noopener" aria-label="${labels.tiktok}" title="TikTok">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3c.5 2.8 2.1 4.4 5 4.8v4c-1.9-.1-3.5-.7-5-1.8v6.2a6.2 6.2 0 1 1-5.4-6.1v4.1a2.3 2.3 0 1 0 1.4 2.1V3h4z"></path></svg>
    </a>`;

  const footer = document.querySelector("footer");
  if (footer) {
    let social = footer.querySelector(".social-links");
    if (!social) {
      social = document.createElement("nav");
      const footerContainer = footer.querySelector(".shell") || footer.firstElementChild || footer;
      footerContainer.prepend(social);
    }
    social.className = "social-links site-social-links";
    social.setAttribute("aria-label", socialTitle);
    social.innerHTML = `
      <span class="site-social-links__title">${socialTitle}</span>
      <span class="site-social-links__icons">${socialIconsMarkup}</span>`;
  }

  document.querySelectorAll(".mobile-nav-panel, details.mobile-menu .mobile-panel, #primary-nav").forEach((panel) => {
    if (panel.querySelector(".menu-social-links")) return;
    const menuSocial = document.createElement("div");
    menuSocial.className = "menu-social-links";
    menuSocial.setAttribute("aria-label", socialTitle);
    menuSocial.innerHTML = socialIconsMarkup;
    panel.append(menuSocial);
  });
  const pageTitle = document.querySelector('meta[property="og:title"]')?.content || document.title;
  const pageDescription = document.querySelector('meta[property="og:description"]')?.content
    || document.querySelector('meta[name="description"]')?.content
    || "";
  const canonical = document.querySelector('link[rel="canonical"]')?.href;
  const isShortGitHubAddress = window.location.hostname === "amitmagician6-maker.github.io"
    && window.location.pathname.startsWith("/amit-mitrani-experience/");
  const currentUrl = isShortGitHubAddress || window.location.hash
    ? window.location.href
    : (canonical || window.location.href);
  const shareText = pageDescription ? `${pageTitle}\n${pageDescription}` : pageTitle;
  const panelId = "page-share-panel";

  const root = document.createElement("aside");
  root.className = "page-share";
  root.setAttribute("aria-label", text.title);
  root.innerHTML = `
    <div class="page-share__panel" id="${panelId}" hidden>
      <div class="page-share__heading">
        <strong>${text.title}</strong>
        <button class="page-share__close" type="button" aria-label="${text.close}">×</button>
      </div>
      <p class="page-share__description">${text.description}</p>
      <div class="page-share__actions">
        <button class="page-share__action page-share__device" type="button">${text.device}</button>
        <a class="page-share__action page-share__action--whatsapp" target="_blank" rel="noopener">${text.whatsapp}</a>
        <button class="page-share__action page-share__copy" type="button">${text.link}</button>
      </div>
      <p class="page-share__status" role="status" aria-live="polite"></p>
    </div>
    <div class="page-share__buttons">
      <a class="page-share__directory" href="${scriptBase ? new URL('../all-pages.html', scriptBase).href : '/all-pages.html'}">${text.directory}</a>
      <button class="page-share__trigger" type="button" aria-expanded="false" aria-controls="${panelId}">${text.trigger}</button>
    </div>
  `;

  document.body.append(root);

  const panel = root.querySelector(".page-share__panel");
  const trigger = root.querySelector(".page-share__trigger");
  const closeButton = root.querySelector(".page-share__close");
  const deviceButton = root.querySelector(".page-share__device");
  const whatsappLink = root.querySelector(".page-share__action--whatsapp");
  const copyButton = root.querySelector(".page-share__copy");
  const status = root.querySelector(".page-share__status");

  whatsappLink.href = `https://wa.me/?text=${encodeURIComponent(`${shareText}\n${currentUrl}`)}`;
  if (!navigator.share) deviceButton.hidden = true;

  const closePanel = (returnFocus = false) => {
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    status.textContent = "";
    if (returnFocus) trigger.focus();
  };

  trigger.addEventListener("click", () => {
    const opening = panel.hidden;
    panel.hidden = !opening;
    trigger.setAttribute("aria-expanded", String(opening));
    status.textContent = "";
    if (opening) closeButton.focus();
  });

  closeButton.addEventListener("click", () => closePanel(true));

  deviceButton.addEventListener("click", async () => {
    try {
      await navigator.share({ title: pageTitle, text: pageDescription, url: currentUrl });
      closePanel();
    } catch (error) {
      if (error?.name !== "AbortError") status.textContent = text.failed;
    }
  });

  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      status.textContent = text.copied;
    } catch {
      const field = document.createElement("textarea");
      field.value = currentUrl;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.append(field);
      field.select();
      const copied = document.execCommand("copy");
      field.remove();
      status.textContent = copied ? text.copied : text.failed;
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) closePanel(true);
  });

  document.addEventListener("click", (event) => {
    if (!panel.hidden && !root.contains(event.target)) closePanel();
  });
})();
