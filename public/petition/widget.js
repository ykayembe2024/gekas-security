(function () {
  const API = "/api/petition";
  const STATE_KEY = "gekas_petition_bubble";
  const fmt = (n) => new Intl.NumberFormat("fr-FR").format(n || 0);

  let petition = null;
  let mode = "flash"; // flash | bubble | modal

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

  function render() {
    const root = ensureRoot();
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
              <input name="country" required autocomplete="country-name" placeholder="ex. RDC" />
              <label class="gp-check"><input type="checkbox" name="confirmed" required /> <span>Je confirme vouloir signer cette pétition.</span></label>
              <div class="gp-error" id="gp-error"></div>
              <button class="gp-btn gp-btn-primary" style="width:100%" type="submit">Signer cette pétition</button>
            </form>
            <div class="gp-thanks hidden" id="gp-thanks">
              <h3>Merci pour votre soutien !</h3>
              <p>Votre signature a bien été enregistrée.</p>
              <div class="gp-share">
                <a target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(text)}">WhatsApp</a>
                <a target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}">Facebook</a>
                <a target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}">X</a>
                <button type="button" data-act="copy" data-url="${escapeAttr(url)}">Copier le lien</button>
              </div>
            </div>
          </div>
        </div>`;
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
        const u = e.target.getAttribute("data-url");
        try {
          await navigator.clipboard.writeText(u);
          e.target.textContent = "Lien copié";
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
        const fd = new FormData(form);
        const body = {
          first_name: String(fd.get("first_name") || "").trim(),
          last_name: String(fd.get("last_name") || "").trim(),
          email: String(fd.get("email") || "").trim(),
          country: String(fd.get("country") || "").trim(),
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
          if (meta) meta.textContent = `${fmt(petition.signatures_count)} / ${fmt(petition.target_signatures)} signatures`;
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

  async function boot() {
    if (location.pathname.startsWith("/petition")) return;
    try {
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
