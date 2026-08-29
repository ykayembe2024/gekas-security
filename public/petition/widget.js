(function () {
  const API = "/api/petition";
  const STATE_KEY = "gekas_petition_bubble";
  const fmt = (n) => new Intl.NumberFormat("fr-FR").format(n || 0);

  const ICONS = {
    wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 3.5A11 11 0 0 0 2.1 17.2L1 23l5.9-1.1A11 11 0 1 0 20.5 3.5zm-8.6 17a9.1 9.1 0 0 1-4.6-1.3l-.3-.2-3.5.7.7-3.4-.2-.3a9.1 9.1 0 1 1 7.9 4.5zm5-6.8c-.3-.1-1.6-.8-1.9-.9s-.4-.1-.6.2-.7.9-.8 1-.3.2-.6.1a7.4 7.4 0 0 1-2.2-1.4 8.2 8.2 0 0 1-1.5-1.9c-.2-.3 0-.4.1-.6l.4-.5.2-.3c.1-.2 0-.4 0-.5l-.9-2.1c-.2-.6-.5-.5-.6-.5h-.5c-.2 0-.5.1-.7.3s-1 1-1 2.4 1 2.7 1.2 2.9a10.7 10.7 0 0 0 4.1 3.5c1.5.6 2.1.5 2.5.4a2.2 2.2 0 0 0 1.4-1c.2-.3.2-.5.1-.6l-.5-.3z"/></svg>',
    fb: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 9h3V6h-3c-2.2 0-4 1.8-4 4v2H7v3h3v7h3v-7h3.1l.9-3H13v-2c0-.6.4-1 1-1z"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.2 2H21l-6.6 7.5L22 22h-6.2l-4.9-6.4L5.3 22H2.5l7-8L2 2h6.3l4.4 5.8L18.2 2zm-1.1 18h1.7L7 3.9H5.2L17.1 20z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>',
  };

  let petition = null;
  let mode = "flash";
  let countrySelect = null;

  function saved() {
    try {
      return JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function save(patch) {
    localStorage.setItem(STATE_KEY, JSON.stringify({ ...saved(), ...patch }));
  }

  function ensureRoot() {
    let root = document.getElementById("gekas-pet-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "gekas-pet-root";
      document.body.appendChild(root);
    } else if (root.parentElement !== document.body || document.body.lastElementChild !== root) {
      document.body.appendChild(root);
    }
    return root;
  }

  function progressPct() {
    if (!petition) return 0;
    return Math.min(
      100,
      Math.round((petition.signatures_count / Math.max(petition.target_signatures, 1)) * 100)
    );
  }

  function shareLinks() {
    const url = petition.share_url || `${location.origin}/petition/`;
    const text = `${petition.title} — Signez : ${url}`;
    return { url, text };
  }

  function shareRow(url, text) {
    return `
      <div class="gp-share" aria-label="Partager">
        <a class="gp-share-btn is-wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(text)}" title="WhatsApp" aria-label="WhatsApp">${ICONS.wa}</a>
        <a class="gp-share-btn is-fb" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" title="Facebook" aria-label="Facebook">${ICONS.fb}</a>
        <a class="gp-share-btn is-x" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}" title="X" aria-label="X">${ICONS.x}</a>
        <button type="button" class="gp-share-btn is-copy" data-act="copy" data-url="${escapeAttr(url)}" title="Copier le lien" aria-label="Copier le lien">${ICONS.copy}</button>
      </div>`;
  }

  function render() {
    const root = ensureRoot();
    countrySelect = null;
    if (mode === "flash") {
      root.innerHTML = `
        <div class="gp-flash" role="dialog" aria-label="Pétition">
          <p class="gp-flash-title">${escapeHtml(petition.title)}</p>
          <div class="gp-flash-meta">${fmt(petition.signatures_count)} / ${fmt(petition.target_signatures)} signatures</div>
          <div class="gp-flash-actions">
            <button type="button" class="gp-btn gp-btn-primary" data-act="open">Signer la pétition</button>
            <button type="button" class="gp-btn gp-btn-ghost" data-act="minify" aria-label="Réduire">✕</button>
          </div>
        </div>`;
    } else if (mode === "bubble") {
      root.innerHTML = `
        <button type="button" class="gp-bubble" data-act="open" aria-label="Ouvrir la pétition">
          Signer<small>${fmt(petition.signatures_count)}</small>
        </button>`;
    } else {
      const { url, text } = shareLinks();
      root.innerHTML = `
        <div class="gp-overlay" data-act="backdrop">
          <div class="gp-modal" role="dialog" aria-modal="true">
            <div class="gp-modal-head">
              <h2>${escapeHtml(petition.title)}</h2>
              <button type="button" class="gp-close" data-act="minify" aria-label="Fermer">×</button>
            </div>
            <img src="${escapeAttr(petition.image || "/petition/cover.svg")}" alt="" />
            <div class="gp-flash-meta">${fmt(petition.signatures_count)} / ${fmt(petition.target_signatures)} signatures</div>
            <div class="gp-bar"><span style="width:${progressPct()}%"></span></div>
            <div class="gp-content">${escapeHtml(petition.content)}</div>
            <form class="gp-form" id="gp-form">
              <label>Prénom</label>
              <input name="first_name" required autocomplete="given-name" />
              <label>Nom</label>
              <input name="last_name" required autocomplete="family-name" />
              <label>E-mail</label>
              <input name="email" type="email" required autocomplete="email" />
              <label>Pays</label>
              <input id="gp-country-seed" type="text" />
              <label class="gp-check"><input type="checkbox" name="confirmed" required /> <span>Je confirme vouloir signer cette pétition.</span></label>
              <div class="gp-error" id="gp-error"></div>
              <button class="gp-btn gp-btn-primary" style="width:100%" type="submit">Signer cette pétition</button>
            </form>
            <div class="gp-thanks hidden" id="gp-thanks" aria-live="polite">
              <h3>Merci pour votre soutien !</h3>
              <p>Votre signature a bien été enregistrée.</p>
              ${shareRow(url, text)}
            </div>
          </div>
        </div>`;
      if (typeof window.gekasInitCountrySelect === "function") {
        countrySelect = window.gekasInitCountrySelect(root.querySelector("#gp-country-seed"), {
          name: "country",
          preferredCode: "CD",
        });
      }
    }

    root.onclick = async (e) => {
      const act = e.target.closest("[data-act]")?.getAttribute("data-act");
      if (!act) return;
      if (act === "minify" || (act === "backdrop" && e.target.dataset.act === "backdrop")) {
        mode = "bubble";
        save({ minimized: true });
        render();
      } else if (act === "open") {
        mode = "modal";
        render();
      } else if (act === "copy") {
        const btn = e.target.closest("[data-act='copy']");
        const u = btn?.getAttribute("data-url");
        try {
          await navigator.clipboard.writeText(u);
          btn.title = "Lien copié";
        } catch {
          prompt("Copiez le lien :", u);
        }
      }
    };

    const form = root.querySelector("#gp-form");
    if (form) {
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const err = root.querySelector("#gp-error");
        err.textContent = "";
        const country = countrySelect?.getValue?.() || "";
        if (!country) {
          err.textContent = "Veuillez sélectionner un pays dans la liste.";
          return;
        }
        const fd = new FormData(form);
        const body = {
          first_name: String(fd.get("first_name") || "").trim(),
          last_name: String(fd.get("last_name") || "").trim(),
          email: String(fd.get("email") || "").trim(),
          country,
          confirmed: form.confirmed.checked,
        };
        try {
          const res = await fetch(`${API}/sign`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.message || "Erreur");
          petition = data.petition;
          form.classList.add("hidden");
          root.querySelector("#gp-thanks").classList.remove("hidden");
          const meta = root.querySelector(".gp-flash-meta");
          if (meta) {
            meta.textContent = `${fmt(petition.signatures_count)} / ${fmt(petition.target_signatures)} signatures`;
          }
          const bar = root.querySelector(".gp-bar > span");
          if (bar) bar.style.width = `${progressPct()}%`;
        } catch (ex) {
          err.textContent = ex.message || "Erreur";
        }
      });
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function boot() {
    if (location.pathname.startsWith("/petition")) return;
    try {
      await loadScript("/petition/countries.js");
      const res = await fetch(API);
      if (!res.ok) return;
      petition = await res.json();
    } catch {
      return;
    }
    const st = saved();
    mode = st.minimized ? "bubble" : "flash";
    render();
    if (mode === "flash") {
      setTimeout(() => {
        if (mode === "flash") {
          mode = "bubble";
          save({ minimized: true });
          render();
        }
      }, 8000);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
