import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import webpush from "web-push";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "uploads");
const PORT = Number(process.env.PORT || 3010);
const UMAMI_URL = process.env.UMAMI_URL || "http://127.0.0.1:3000";
const WEBSITE_ID = process.env.WEBSITE_ID || "c92b66b9-3b10-4b1b-a36c-74e99b0ba379";
const UMAMI_USER = process.env.UMAMI_USER || "admin";
const UMAMI_PASS = process.env.UMAMI_PASS || "GekasStats2026!Secure";
const POLL_MS = Number(process.env.POLL_MS || 120000);
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://gekas:gekas_petition_2026@127.0.0.1:55437/gekas_petition";
const PUBLIC_SITE = process.env.PUBLIC_SITE || "https://gekas-security.com";

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const pool = new pg.Pool({ connectionString: DATABASE_URL });

const VAPID_FILE = path.join(DATA_DIR, "vapid.json");
const SUBS_FILE = path.join(DATA_DIR, "subscriptions.json");
const STATE_FILE = path.join(DATA_DIR, "state.json");

const DEFAULT_CONTENT = `Le peuple congolais a subi, depuis des décennies, des massacres, des violences systématiques et un pillage organisé de ses ressources.

Le GENOCOST désigne ce crime de longue durée : destruction de vies humaines et spoliation économique en République Démocratique du Congo.

Nous demandons la reconnaissance officielle du GENOCOST en RDC, la vérité pour les victimes, et la justice pour que ces crimes ne restent pas sans réponse.

Signez pour soutenir cet appel.`;

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

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function json(res, status, body) {
  cors(res);
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function text(res, status, body, contentType = "text/plain; charset=utf-8") {
  cors(res);
  res.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
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

function bearer(req) {
  const h = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : "";
}

async function verifyAdmin(req) {
  const token = bearer(req);
  if (!token) return false;
  try {
    const res = await fetch(`${UMAMI_URL}/api/auth/verify`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) return true;
  } catch {
    /* fallthrough */
  }
  // Fallback: accept token if login with same token pattern works via websites list
  try {
    const res = await fetch(`${UMAMI_URL}/api/websites`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS petition (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      image TEXT NOT NULL DEFAULT '',
      target_signatures INTEGER NOT NULL DEFAULT 15000,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS petition_signature (
      id SERIAL PRIMARY KEY,
      petition_id INTEGER NOT NULL REFERENCES petition(id) ON DELETE CASCADE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL,
      country TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (petition_id, email)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_petition_signature_petition_id
      ON petition_signature (petition_id);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_petition_signature_created_at
      ON petition_signature (created_at DESC);
  `);
  const { rows } = await pool.query("SELECT id FROM petition ORDER BY id ASC LIMIT 1");
  if (!rows.length) {
    await pool.query(
      `INSERT INTO petition (title, content, image, target_signatures)
       VALUES ($1, $2, $3, $4)`,
      [
        "Reconnaître le GENOCOST en RDC",
        DEFAULT_CONTENT,
        `${PUBLIC_SITE}/petition/cover.svg`,
        15000,
      ]
    );
  }
}

async function getPetitionRow() {
  const { rows } = await pool.query("SELECT * FROM petition ORDER BY id ASC LIMIT 1");
  return rows[0] || null;
}

async function getSignatureCount(petitionId) {
  const { rows } = await pool.query(
    "SELECT COUNT(*)::int AS c FROM petition_signature WHERE petition_id = $1",
    [petitionId]
  );
  return rows[0].c;
}

function publicPetition(row, count) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    image: row.image,
    target_signatures: row.target_signatures,
    signatures_count: count,
    created_at: row.created_at,
    share_url: `${PUBLIC_SITE}/petition/`,
  };
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
      if (viewDelta > 0) {
        parts.push(`${viewDelta} page${viewDelta > 1 ? "s" : ""} vue${viewDelta > 1 ? "s" : ""}`);
      }
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

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    return res.end();
  }

  // Serve uploaded images
  if (req.method === "GET" && url.pathname.startsWith("/uploads/")) {
    const name = path.basename(url.pathname);
    const file = path.join(UPLOAD_DIR, name);
    if (!file.startsWith(UPLOAD_DIR) || !fs.existsSync(file)) {
      return json(res, 404, { message: "not found" });
    }
    const ext = path.extname(file).toLowerCase();
    const types = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml" };
    const buf = fs.readFileSync(file);
    cors(res);
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream", "Cache-Control": "public, max-age=86400" });
    return res.end(buf);
  }

  try {
    // --- Push ---
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

    // --- Petition public ---
    if (req.method === "GET" && (url.pathname === "/petition" || url.pathname === "/api/petition")) {
      const row = await getPetitionRow();
      if (!row) return json(res, 404, { message: "Pétition introuvable" });
      const count = await getSignatureCount(row.id);
      return json(res, 200, publicPetition(row, count));
    }

    if (req.method === "POST" && (url.pathname === "/petition/sign" || url.pathname === "/api/petition/sign")) {
      const body = await readBody(req);
      const first_name = String(body.first_name || "").trim();
      const last_name = String(body.last_name || "").trim();
      const email = normalizeEmail(body.email);
      const country = String(body.country || "").trim();
      const confirmed = Boolean(body.confirmed);

      if (!first_name || !last_name || !email || !country) {
        return json(res, 400, { message: "Tous les champs sont obligatoires." });
      }
      if (!isEmail(email)) return json(res, 400, { message: "E-mail invalide." });
      if (!confirmed) return json(res, 400, { message: "Veuillez confirmer votre signature." });

      const row = await getPetitionRow();
      if (!row) return json(res, 404, { message: "Pétition introuvable" });

      try {
        await pool.query(
          `INSERT INTO petition_signature (petition_id, first_name, last_name, email, country)
           VALUES ($1, $2, $3, $4, $5)`,
          [row.id, first_name, last_name, email, country]
        );
      } catch (err) {
        if (err.code === "23505") {
          return json(res, 409, { message: "Cette adresse e-mail a déjà signé cette pétition." });
        }
        throw err;
      }

      const count = await getSignatureCount(row.id);
      return json(res, 201, {
        message: "Merci pour votre soutien ! Votre signature a bien été enregistrée.",
        signatures_count: count,
        petition: publicPetition(row, count),
      });
    }

    // --- Petition admin ---
    if (req.method === "PUT" && (url.pathname === "/petition" || url.pathname === "/api/petition")) {
      if (!(await verifyAdmin(req))) return json(res, 401, { message: "Non autorisé" });
      const body = await readBody(req);
      const row = await getPetitionRow();
      if (!row) return json(res, 404, { message: "Pétition introuvable" });

      const title = body.title != null ? String(body.title).trim() : row.title;
      const content = body.content != null ? String(body.content) : row.content;
      const image = body.image != null ? String(body.image).trim() : row.image;
      const target = body.target_signatures != null
        ? Math.max(1, Number(body.target_signatures) || row.target_signatures)
        : row.target_signatures;

      await pool.query(
        `UPDATE petition SET title=$1, content=$2, image=$3, target_signatures=$4 WHERE id=$5`,
        [title, content, image, target, row.id]
      );
      const updated = await getPetitionRow();
      const count = await getSignatureCount(updated.id);
      return json(res, 200, publicPetition(updated, count));
    }

    if (req.method === "POST" && (url.pathname === "/petition/image" || url.pathname === "/api/petition/image")) {
      if (!(await verifyAdmin(req))) return json(res, 401, { message: "Non autorisé" });
      const body = await readBody(req);
      const dataUrl = String(body.dataUrl || "");
      const m = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,(.+)$/i.exec(dataUrl);
      if (!m) return json(res, 400, { message: "Image invalide (PNG/JPEG/WebP/GIF)." });
      const ext = m[1].toLowerCase().includes("png")
        ? "png"
        : m[1].toLowerCase().includes("webp")
          ? "webp"
          : m[1].toLowerCase().includes("gif")
            ? "gif"
            : "jpg";
      const name = `petition-${randomUUID()}.${ext}`;
      fs.writeFileSync(path.join(UPLOAD_DIR, name), Buffer.from(m[2], "base64"));
      const imageUrl = `${PUBLIC_SITE}/api/petition/uploads/${name}`;
      const row = await getPetitionRow();
      await pool.query(`UPDATE petition SET image=$1 WHERE id=$2`, [imageUrl, row.id]);
      const updated = await getPetitionRow();
      const count = await getSignatureCount(updated.id);
      return json(res, 200, { image: imageUrl, petition: publicPetition(updated, count) });
    }

    // Alias uploads under /api/petition/uploads/
    if (req.method === "GET" && url.pathname.startsWith("/api/petition/uploads/")) {
      const name = path.basename(url.pathname);
      const file = path.join(UPLOAD_DIR, name);
      if (!fs.existsSync(file)) return json(res, 404, { message: "not found" });
      const ext = path.extname(file).toLowerCase();
      const types = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml" };
      const buf = fs.readFileSync(file);
      cors(res);
      res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream", "Cache-Control": "public, max-age=86400" });
      return res.end(buf);
    }

    if (req.method === "GET" && (url.pathname === "/petition/signatures" || url.pathname === "/api/petition/signatures")) {
      if (!(await verifyAdmin(req))) return json(res, 401, { message: "Non autorisé" });
      const row = await getPetitionRow();
      const page = Math.max(1, Number(url.searchParams.get("page") || 1));
      const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") || 50)));
      const offset = (page - 1) * pageSize;
      const total = await getSignatureCount(row.id);
      const { rows } = await pool.query(
        `SELECT id, first_name, last_name, email, country, created_at
         FROM petition_signature WHERE petition_id=$1
         ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [row.id, pageSize, offset]
      );
      return json(res, 200, { data: rows, total, page, pageSize });
    }

    if (req.method === "GET" && (url.pathname === "/petition/signatures.csv" || url.pathname === "/api/petition/signatures.csv")) {
      if (!(await verifyAdmin(req))) return json(res, 401, { message: "Non autorisé" });
      const row = await getPetitionRow();
      const { rows } = await pool.query(
        `SELECT first_name, last_name, email, country, created_at
         FROM petition_signature WHERE petition_id=$1 ORDER BY created_at ASC`,
        [row.id]
      );
      const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = ["first_name,last_name,email,country,created_at"];
      for (const r of rows) {
        lines.push([r.first_name, r.last_name, r.email, r.country, r.created_at.toISOString()].map(esc).join(","));
      }
      const csv = lines.join("\n");
      cors(res);
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="petition-signatures.csv"',
        "Content-Length": Buffer.byteLength(csv),
      });
      return res.end(csv);
    }

    return json(res, 404, { message: "not found" });
  } catch (err) {
    console.error(err);
    return json(res, 500, { message: err.message || "server error" });
  }
});

await initDb();
server.listen(PORT, "127.0.0.1", () => {
  console.log(`gekas-stats-api on 127.0.0.1:${PORT}`);
  pollOnce();
  setInterval(pollOnce, POLL_MS);
});
