import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import webpush from "web-push";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const PORT = Number(process.env.PORT || 3010);
const UMAMI_URL = process.env.UMAMI_URL || "http://127.0.0.1:3000";
const WEBSITE_ID = process.env.WEBSITE_ID || "c92b66b9-3b10-4b1b-a36c-74e99b0ba379";
const UMAMI_USER = process.env.UMAMI_USER || "admin";
const UMAMI_PASS = process.env.UMAMI_PASS || "GekasStats2026!Secure";
const POLL_MS = Number(process.env.POLL_MS || 120000);

fs.mkdirSync(DATA_DIR, { recursive: true });

const VAPID_FILE = path.join(DATA_DIR, "vapid.json");
const SUBS_FILE = path.join(DATA_DIR, "subscriptions.json");
const STATE_FILE = path.join(DATA_DIR, "state.json");

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function ensureVapid() {
  let keys = readJson(VAPID_FILE, null);
  if (!keys?.publicKey || !keys?.privateKey) {
    keys = webpush.generateVAPIDKeys();
    writeJson(VAPID_FILE, keys);
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@gekas-security.com",
    keys.publicKey,
    keys.privateKey
  );
  return keys;
}

const vapid = ensureVapid();

function getSubs() {
  return readJson(SUBS_FILE, []);
}

function saveSubs(subs) {
  writeJson(SUBS_FILE, subs);
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

async function umamiLogin() {
  const res = await fetch(`${UMAMI_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: UMAMI_USER, password: UMAMI_PASS }),
  });
  if (!res.ok) throw new Error(`Umami login failed: ${res.status}`);
  const data = await res.json();
  return data.token;
}

async function fetchTodayStats(token) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const endAt = Date.now();
  const startAt = start.getTime();
  const res = await fetch(
    `${UMAMI_URL}/api/websites/${WEBSITE_ID}/stats?startAt=${startAt}&endAt=${endAt}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Umami stats failed: ${res.status}`);
  return res.json();
}

async function broadcast(payload) {
  const subs = getSubs();
  const keep = [];
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload));
      keep.push(sub);
    } catch (err) {
      if (err.statusCode !== 404 && err.statusCode !== 410) keep.push(sub);
    }
  }
  saveSubs(keep);
}

async function pollOnce() {
  try {
    const token = await umamiLogin();
    const stats = await fetchTodayStats(token);
    const visitors = stats.visitors?.value ?? stats.visitors ?? 0;
    const pageviews = stats.pageviews?.value ?? stats.pageviews ?? 0;
    const state = readJson(STATE_FILE, { visitors: 0, pageviews: 0 });
    const visitorDelta = visitors - (state.visitors || 0);
    const viewDelta = pageviews - (state.pageviews || 0);

    if ((visitorDelta > 0 || viewDelta > 0) && (state.visitors > 0 || state.pageviews > 0)) {
      const parts = [];
      if (visitorDelta > 0) parts.push(`${visitorDelta} visiteur${visitorDelta > 1 ? "s" : ""}`);
      if (viewDelta > 0) parts.push(`${viewDelta} page${viewDelta > 1 ? "s" : ""} vue${viewDelta > 1 ? "s" : ""}`);
      await broadcast({
        title: "GEKAS — nouvelle audience",
        body: `Aujourd'hui : ${parts.join(", ")}. Total ${visitors} visiteurs / ${pageviews} vues.`,
        url: "/",
      });
    }

    writeJson(STATE_FILE, { visitors, pageviews, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[poll]", err.message || err);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    return res.end();
  }

  try {
    if (req.method === "GET" && url.pathname === "/push/vapid-public-key") {
      return json(res, 200, { publicKey: vapid.publicKey });
    }

    if (req.method === "POST" && url.pathname === "/push/subscribe") {
      const body = await readBody(req);
      const subscription = body.subscription;
      if (!subscription?.endpoint) return json(res, 400, { message: "subscription invalide" });
      const subs = getSubs().filter((s) => s.endpoint !== subscription.endpoint);
      subs.push(subscription);
      saveSubs(subs);
      return json(res, 200, { ok: true, count: subs.length });
    }

    if (req.method === "POST" && url.pathname === "/push/unsubscribe") {
      const body = await readBody(req);
      const endpoint = body.endpoint || body.subscription?.endpoint;
      const subs = getSubs().filter((s) => s.endpoint !== endpoint);
      saveSubs(subs);
      return json(res, 200, { ok: true });
    }

    if (req.method === "GET" && url.pathname === "/push/health") {
      return json(res, 200, { ok: true, subs: getSubs().length });
    }

    return json(res, 404, { message: "not found" });
  } catch (err) {
    console.error(err);
    return json(res, 500, { message: err.message || "server error" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`gekas-stats-api on 127.0.0.1:${PORT}`);
  pollOnce();
  setInterval(pollOnce, POLL_MS);
});
