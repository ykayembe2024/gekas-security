const WEBSITE_ID = "c92b66b9-3b10-4b1b-a36c-74e99b0ba379";
const TOKEN_KEY = "gekas_stats_token";
const DAYS_KEY = "gekas_stats_days";

const loginView = document.getElementById("login-view");
const appView = document.getElementById("app-view");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const notifyBtn = document.getElementById("notify-btn");
const periodBar = document.getElementById("period-bar");
const toastEl = document.getElementById("toast");

let selectedDays = Number(localStorage.getItem(DAYS_KEY) || 1);
let refreshTimer = null;

function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.remove("hidden");
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.add("hidden"), 2800);
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function showApp(loggedIn) {
  loginView.classList.toggle("hidden", loggedIn);
  appView.classList.toggle("hidden", !loggedIn);
}

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) {
    setToken(null);
    showApp(false);
    throw new Error("Session expirée");
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || `Erreur ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function startOfDaysAgo(days) {
  const end = new Date();
  const start = new Date();
  if (days <= 1) {
    start.setHours(0, 0, 0, 0);
  } else {
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);
  }
  return { startAt: start.getTime(), endAt: end.getTime() };
}

function formatNumber(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("fr-FR").format(Math.round(n));
}

function formatPct(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${Math.round(n * 100)} %`;
}

function metricValue(v) {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v.value != null) return Number(v.value) || 0;
  return Number(v) || 0;
}

function deltaHint(current, previous) {
  if (previous == null || previous === 0) return "";
  const pct = ((current - previous) / previous) * 100;
  return `${pct >= 0 ? "+" : ""}${Math.round(pct)} % vs période préc.`;
}

function normalizeSeries(pageviews) {
  const raw = pageviews?.pageviews || pageviews?.data || pageviews || [];
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => ({
    x: row.x ?? row.t ?? row.date ?? row.time,
    y: Number(row.y ?? row.pageviews ?? row.count ?? 0) || 0,
  }));
}

function dayLabel(ts) {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(new Date(ts));
}

async function loadStats() {
  const { startAt, endAt } = startOfDaysAgo(selectedDays);
  const unit = selectedDays <= 1 ? "hour" : "day";

  const [stats, pageviews, urls, countries] = await Promise.all([
    api(`/api/websites/${WEBSITE_ID}/stats?startAt=${startAt}&endAt=${endAt}`),
    api(`/api/websites/${WEBSITE_ID}/pageviews?startAt=${startAt}&endAt=${endAt}&unit=${unit}&timezone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`),
    api(`/api/websites/${WEBSITE_ID}/metrics?startAt=${startAt}&endAt=${endAt}&type=path&limit=6`),
    api(`/api/websites/${WEBSITE_ID}/metrics?startAt=${startAt}&endAt=${endAt}&type=country&limit=6`),
  ]);

  const visitors = metricValue(stats.visitors);
  const views = metricValue(stats.pageviews);
  const visits = metricValue(stats.visits ?? stats.sessions);
  const bounces = metricValue(stats.bounces);
  const prev = stats.comparison || {};

  document.getElementById("m-visitors").textContent = formatNumber(visitors);
  document.getElementById("m-views").textContent = formatNumber(views);
  document.getElementById("m-sessions").textContent = formatNumber(visits);
  document.getElementById("m-bounce").textContent = formatPct(
    visits ? bounces / visits : metricValue(stats.bounceRate ?? stats.bounce_rate)
  );

  document.getElementById("m-visitors-hint").textContent = deltaHint(visitors, metricValue(prev.visitors));
  document.getElementById("m-views-hint").textContent = deltaHint(views, metricValue(prev.pageviews));

  const series = normalizeSeries(pageviews);
  const chartData = series.map((row) => ({
    x: row.x,
    y: row.y,
  }));

  renderChart(chartData);
  renderList("top-pages", urls?.data || urls || [], (row) => row.x || row.url || "/");
  renderList("top-countries", countries?.data || countries || [], (row) => row.x || row.country || "?");

  document.getElementById("updated-at").textContent =
    `Mis à jour ${new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date())}`;
}

function renderChart(rows) {
  const root = document.getElementById("chart-bars");
  if (!rows.length) {
    root.innerHTML = `<div style="color:var(--muted);font-size:0.9rem">Pas encore de données sur cette période.</div>`;
    return;
  }
  const max = Math.max(...rows.map((r) => r.y), 1);
  const sliced = rows.slice(-Math.min(rows.length, selectedDays <= 1 ? 12 : 14));
  root.innerHTML = sliced
    .map((r) => {
      const h = Math.max(4, Math.round((r.y / max) * 120));
      const label = selectedDays <= 1
        ? new Intl.DateTimeFormat("fr-FR", { hour: "2-digit" }).format(new Date(r.x))
        : dayLabel(r.x);
      return `<div class="bar-col" title="${r.y} vues"><div class="bar" style="height:${h}px"></div><div class="bar-label">${label}</div></div>`;
    })
    .join("");
}

function renderList(id, rows, labelFn) {
  const el = document.getElementById(id);
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    el.innerHTML = `<li><span class="path">Aucune donnée</span></li>`;
    return;
  }
  el.innerHTML = list
    .slice(0, 6)
    .map((row) => {
      const label = labelFn(row);
      const count = row.y ?? row.count ?? row.pageviews ?? 0;
      return `<li><span class="path">${escapeHtml(String(label))}</span><span class="count">${formatNumber(count)}</span></li>`;
    })
    .join("");
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function syncPeriodChips() {
  periodBar.querySelectorAll(".chip").forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.days) === selectedDays);
  });
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  loginBtn.disabled = true;
  try {
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setToken(data.token);
    showApp(true);
    await loadStats();
    startAutoRefresh();
    toast("Connecté");
  } catch (err) {
    loginError.textContent = err.message || "Connexion impossible";
  } finally {
    loginBtn.disabled = false;
  }
});

function logout() {
  setToken(null);
  stopAutoRefresh();
  showApp(false);
}

logoutBtn.addEventListener("click", logout);
document.getElementById("logout-btn-2")?.addEventListener("click", logout);

const tabAudience = document.getElementById("tab-audience");
const tabPetition = document.getElementById("tab-petition");
const navTabs = document.getElementById("nav-tabs");

navTabs?.addEventListener("click", async (e) => {
  const btn = e.target.closest(".nav-tab");
  if (!btn) return;
  navTabs.querySelectorAll(".nav-tab").forEach((b) => b.classList.toggle("active", b === btn));
  const tab = btn.dataset.tab;
  tabAudience.classList.toggle("hidden", tab !== "audience");
  tabPetition.classList.toggle("hidden", tab !== "petition");
  if (tab === "petition") {
    try {
      await loadPetitionAdmin();
    } catch (err) {
      toast(err.message);
    }
  }
});

async function loadPetitionAdmin() {
  const data = await api("/api/petition");
  document.getElementById("pet-title").value = data.title || "";
  document.getElementById("pet-content").value = data.content || "";
  document.getElementById("pet-target").value = data.target_signatures || 15000;
  document.getElementById("pet-image-url").value = data.image || "";
  document.getElementById("pet-preview").src = data.image || "/icons/icon-192.png";
  document.getElementById("pet-count-line").textContent =
    `${formatNumber(data.signatures_count)} / ${formatNumber(data.target_signatures)} signatures`;
  const sigs = await api("/api/petition/signatures?page=1&pageSize=50");
  const list = document.getElementById("sig-list");
  if (!sigs.data?.length) {
    list.innerHTML = `<div class="sig-card">Aucune signature pour le moment.</div>`;
  } else {
    list.innerHTML = sigs.data
      .map((s) => {
        const when = new Intl.DateTimeFormat("fr-FR", {
          dateStyle: "short",
          timeStyle: "short",
        }).format(new Date(s.created_at));
        return `<div class="sig-card"><strong>${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}</strong><span>${escapeHtml(s.email)} · ${escapeHtml(s.country)} · ${when}</span></div>`;
      })
      .join("");
  }
}

document.getElementById("pet-image-url")?.addEventListener("input", (e) => {
  document.getElementById("pet-preview").src = e.target.value || "/icons/icon-192.png";
});

document.getElementById("pet-image-file")?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = await api("/api/petition/image", {
        method: "POST",
        body: JSON.stringify({ dataUrl: reader.result }),
      });
      document.getElementById("pet-image-url").value = data.image;
      document.getElementById("pet-preview").src = data.image;
      toast("Image mise à jour");
    } catch (err) {
      toast(err.message);
    }
  };
  reader.readAsDataURL(file);
});

document.getElementById("petition-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = document.getElementById("pet-error");
  err.textContent = "";
  try {
    await api("/api/petition", {
      method: "PUT",
      body: JSON.stringify({
        title: document.getElementById("pet-title").value.trim(),
        content: document.getElementById("pet-content").value,
        image: document.getElementById("pet-image-url").value.trim(),
        target_signatures: Number(document.getElementById("pet-target").value),
      }),
    });
    toast("Pétition enregistrée");
    await loadPetitionAdmin();
  } catch (ex) {
    err.textContent = ex.message;
  }
});

document.getElementById("pet-export")?.addEventListener("click", async () => {
  try {
    const token = getToken();
    const res = await fetch("/api/petition/signatures.csv", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Export impossible");
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "petition-signatures.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    toast(err.message);
  }
});

periodBar.addEventListener("click", async (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  selectedDays = Number(btn.dataset.days);
  localStorage.setItem(DAYS_KEY, String(selectedDays));
  syncPeriodChips();
  try {
    await loadStats();
  } catch (err) {
    toast(err.message);
  }
});

function startAutoRefresh() {
  stopAutoRefresh();
  refreshTimer = setInterval(() => {
    loadStats().catch(() => {});
  }, 60_000);
}

function stopAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function enablePush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    toast("Notifications non supportées sur cet appareil");
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    toast("Permission refusée");
    return;
  }
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await api("/push/vapid-public-key");
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }
  await api("/push/subscribe", {
    method: "POST",
    body: JSON.stringify({ subscription: sub.toJSON() }),
  });
  notifyBtn.textContent = "Alertes actives";
  toast("Notifications activées");
}

notifyBtn.addEventListener("click", () => {
  enablePush().catch((err) => toast(err.message || "Échec des notifications"));
});

async function init() {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("/sw.js");
    } catch {
      /* ignore */
    }
  }
  syncPeriodChips();
  if (getToken()) {
    showApp(true);
    try {
      await loadStats();
      startAutoRefresh();
    } catch {
      setToken(null);
      showApp(false);
    }
  } else {
    showApp(false);
  }
}

init();
