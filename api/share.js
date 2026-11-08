// Share pages: /journey/:id and /postcard/:id (rewritten here by vercel.json).
//
// Returns the normal app shell (dist/index.html) with Open Graph / Twitter meta
// injected into the initial HTML, so link previews (WhatsApp, Facebook, Viber,
// Messenger, X, Slack, iMessage…) show the right title, text and image. Humans get
// the exact same app — it reads the URL and opens the journey / postcard.
//
// PRIVACY: postcard data comes ONLY from the Apps Script "approved_postcards"
// endpoint, which already returns just rows with Status = Approved AND
// Consent to Publish = TRUE. Anything else (pending, rejected, no consent, unknown id)
// gets the generic app preview — never an error that confirms a hidden postcard exists.
//
// No secrets are used here; every source is already public.
import fs from "node:fs";
import path from "node:path";

const SHEET_ID = "1LQYCy84OWmOSnC4BHEFONB2Bw5vcCUz3c-3usU_ZXmQ";
const JOURNEYS_CSV = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Journey`;
const WEBHOOK = "https://script.google.com/macros/s/AKfycbzKzq7vKbWAw6PwmGoPenTpv194K_64CfcY3Gd5KcGDduu6H8z1FNmgt6z11aCMlghujg/exec";
const SITE = "The Van — Radio On Wheels";
const DEFAULT_DESC = "Μουσική, τόποι και άνθρωποι. Η επόμενη διαδρομή ξεκινάει από εσένα.";
const FETCH_TIMEOUT_MS = 6000;

export function esc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function clip(text, max) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

function httpsUrl(u) {
  const s = String(u || "").trim();
  return /^https:\/\//i.test(s) ? s : "";
}

async function timedFetch(url, opts) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try { return await fetch(url, { ...(opts || {}), signal: ctrl.signal }); }
  finally { clearTimeout(timer); }
}

// Minimal RFC-4180 CSV parser (quoted fields, "" escapes, newlines inside quotes).
export function parseCSV(text) {
  const rows = []; let row = []; let cur = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c !== "\r") cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

export async function journeyMeta(id, origin) {
  const res = await timedFetch(JOURNEYS_CSV);
  if (!res.ok) return null;
  const rows = parseCSV(await res.text());
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (n) => header.indexOf(n);
  const iT = col("title"), iD = col("description"), iI = col("image url"), iA = col("audio url");
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const title = (row[iT] || "").trim();
    const m = title.match(/#(\d+)/);
    if (!title || !(row[iA] || "").trim()) continue; // same visibility rule as the app (needs audio)
    if (!m || m[1] !== String(id)) continue;
    return {
      title: `${title} · ${SITE}`,
      description: clip(row[iD], 200) || DEFAULT_DESC,
      image: httpsUrl(row[iI]) || `${origin}/og-default.png`,
      type: "music.song",
    };
  }
  return null;
}

export async function postcardMeta(id, origin) {
  const res = await timedFetch(`${WEBHOOK}?action=approved_postcards`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || data.ok !== true || !Array.isArray(data.postcards)) return null;
  const p = data.postcards.find((x) => String(x.id || "") === String(id));
  if (!p) return null; // not approved / no consent / unknown → generic preview
  const place = String(p.placeName || "").trim();
  return {
    title: place ? `Καρτ ποστάλ από ${place} · ${SITE}` : `Καρτ ποστάλ · ${SITE}`,
    description: clip(p.story, 180) || DEFAULT_DESC,
    image: httpsUrl(p.photoUrl) || `${origin}/og-default.png`,
    type: "article",
  };
}

export function metaTags(meta, url, origin) {
  const m = meta || { title: SITE, description: DEFAULT_DESC, image: `${origin}/og-default.png`, type: "website" };
  const e = esc;
  return [
    `<title>${e(m.title)}</title>`,
    `<meta name="description" content="${e(m.description)}" />`,
    `<link rel="canonical" href="${e(url)}" />`,
    `<meta property="og:site_name" content="${e(SITE)}" />`,
    `<meta property="og:type" content="${e(m.type)}" />`,
    `<meta property="og:title" content="${e(m.title)}" />`,
    `<meta property="og:description" content="${e(m.description)}" />`,
    `<meta property="og:url" content="${e(url)}" />`,
    `<meta property="og:image" content="${e(m.image)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${e(m.title)}" />`,
    `<meta name="twitter:description" content="${e(m.description)}" />`,
    `<meta name="twitter:image" content="${e(m.image)}" />`,
  ].join("\n    ");
}

async function loadShell(origin) {
  for (const p of [path.join(process.cwd(), "dist", "index.html"), path.join(process.cwd(), "index.html")]) {
    try {
      const html = fs.readFileSync(p, "utf8");
      // the source index.html (dev) points at /src/main.jsx — only the built one is usable
      if (html.includes("/assets/")) return html;
    } catch (e) { /* try next */ }
  }
  try {
    const r = await timedFetch(`${origin}/index.html`);
    if (r.ok) { const html = await r.text(); if (html.includes("/assets/")) return html; }
  } catch (e) { /* fall through */ }
  return null;
}

export function injectMeta(shell, tags) {
  const noTitle = shell.replace(/<title>[\s\S]*?<\/title>/i, "");
  return noTitle.replace(/<\/head>/i, `    ${tags}\n  </head>`);
}

export default async function handler(req, res) {
  const type = String((req.query && req.query.type) || "");
  const id = String((req.query && req.query.id) || "");
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  const origin = `https://${String(host).split(",")[0].trim()}`;

  let meta = null;
  let valid = false;
  try {
    if (type === "journey" && /^\d{1,5}$/.test(id)) { valid = true; meta = await journeyMeta(id, origin); }
    else if (type === "postcard" && /^[\w.:-]{1,100}$/.test(id)) { valid = true; meta = await postcardMeta(id, origin); }
  } catch (e) { meta = null; }

  // Only a real, publishable item gets its own canonical URL; anything else points at the home page.
  const url = valid && meta ? `${origin}/${type}/${encodeURIComponent(id)}` : origin + "/";
  const tags = metaTags(meta, url, origin);
  const shell = await loadShell(origin);

  let html;
  if (shell) {
    html = injectMeta(shell, tags);
  } else {
    // Last resort (shell unreadable): crawlers still get the meta; people are sent to the
    // app, which understands ?j=<id> / ?p=<id> as well as the pretty paths.
    const q = type === "journey" ? `?j=${encodeURIComponent(id)}` : type === "postcard" ? `?p=${encodeURIComponent(id)}` : "";
    html = `<!doctype html><html lang="el"><head><meta charset="utf-8" />${tags}</head><body><script>location.replace(${JSON.stringify("/" + q)});</script><noscript><a href="/">${esc(SITE)}</a></noscript></body></html>`;
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // Edge-cache for 5 min; serve stale for a day while refreshing. Previews of a postcard that
  // later loses approval therefore disappear within minutes, not days.
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=86400");
  res.status(200).send(html);
}
