const API = "/api/petition";

const fmt = (n) => new Intl.NumberFormat("fr-FR").format(n || 0);

function setProgress(count, target) {
  const pct = Math.min(100, Math.round(((count || 0) / Math.max(target || 1, 1)) * 100));
  for (const id of ["p-count", "p-count-m"]) {
    const el = document.getElementById(id);
    if (el) el.textContent = fmt(count);
  }
  for (const id of ["p-target", "p-target-m"]) {
    const el = document.getElementById(id);
    if (el) el.textContent = fmt(target);
  }
  for (const id of ["p-bar", "p-bar-m"]) {
    const el = document.getElementById(id);
    if (el) el.style.width = `${pct}%`;
  }
}

function setupShare(url, title) {
  const text = `${title} — Signez la pétition : ${url}`;
  document.getElementById("share-wa").href = `https://wa.me/?text=${encodeURIComponent(text)}`;
  document.getElementById("share-fb").href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  document.getElementById("share-x").href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  document.getElementById("share-copy").onclick = async () => {
    try {
      await navigator.clipboard.writeText(url);
      document.getElementById("share-copy").textContent = "Lien copié";
    } catch {
      prompt("Copiez le lien :", url);
    }
  };
}

async function load() {
  const res = await fetch(API);
  if (!res.ok) throw new Error("Impossible de charger la pétition");
  const data = await res.json();
  document.getElementById("p-title").textContent = data.title;
  document.title = `${data.title} — Pétition`;
  document.getElementById("p-content").textContent = data.content;
  document.getElementById("p-image").src = data.image || "/petition/cover.svg";
  setProgress(data.signatures_count, data.target_signatures);
  setupShare(data.share_url || location.href, data.title);
  return data;
}

document.getElementById("sign-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = document.getElementById("form-error");
  const btn = document.getElementById("submit-btn");
  err.textContent = "";
  btn.disabled = true;
  try {
    const body = {
      first_name: document.getElementById("first_name").value.trim(),
      last_name: document.getElementById("last_name").value.trim(),
      email: document.getElementById("email").value.trim(),
      country: document.getElementById("country").value.trim(),
      confirmed: document.getElementById("confirmed").checked,
    };
    const res = await fetch(`${API}/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Échec de la signature");
    setProgress(data.signatures_count, data.petition?.target_signatures);
    document.getElementById("sign-form").classList.add("hidden");
    document.getElementById("thanks").classList.remove("hidden");
    setupShare(data.petition?.share_url || location.href, data.petition?.title || document.title);
  } catch (ex) {
    err.textContent = ex.message || "Erreur";
  } finally {
    btn.disabled = false;
  }
});

load().catch((e) => {
  document.getElementById("form-error").textContent = e.message;
});
