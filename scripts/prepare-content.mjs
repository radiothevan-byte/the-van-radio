// Weekly content preparation for the Content Engine (Song of the Day + The Van Poll).
//
// Creates DRAFTS ONLY: every item is sent to the Apps Script webhook, which always stores it with
// Status = "Pending". Nothing here can approve or publish anything — that is done by hand in the
// Google Sheet (Pending -> Approved), then the Apps Script daily trigger takes it from there.
//
// Sources, in order:
//   1. Claude API — only when ANTHROPIC_API_KEY is set (a few cents per YEAR at weekly cadence).
//   2. content/seed-*.json — a fixed list, no API and no cost; used when there is no key or the call fails.
//
// Environment (GitHub Actions secrets — never committed):
//   CONTENT_WEBHOOK_SECRET   required  (must equal the Script Property of the same name in Apps Script)
//   ANTHROPIC_API_KEY        optional
//   ANTHROPIC_MODEL          optional  (default claude-haiku-5-5)
//   CONTENT_WEBHOOK_URL      optional  (default: the app's public Apps Script /exec URL)
//   SONG_COUNT / POLL_COUNT  optional  (default 7 / 1)
//   DRY_RUN=1                optional  (print what would be sent, send nothing)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const WEBHOOK = process.env.CONTENT_WEBHOOK_URL || "https://script.google.com/macros/s/AKfycbzKzq7vKbWAw6PwmGoPenTpv194K_64CfcY3Gd5KcGDduu6H8z1FNmgt6z11aCMlghujg/exec";
const SECRET = process.env.CONTENT_WEBHOOK_SECRET || "";
const API_KEY = process.env.ANTHROPIC_API_KEY || "";
const API_URL = process.env.ANTHROPIC_API_URL || "https://api.anthropic.com/v1/messages";
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
const SONG_COUNT = parseInt(process.env.SONG_COUNT || "7", 10);
const POLL_COUNT = parseInt(process.env.POLL_COUNT || "1", 10);
const DRY = process.env.DRY_RUN === "1";

const clip = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);

export function sanitizeSongs(list) {
  return (Array.isArray(list) ? list : [])
    .map((s) => ({ title: clip(s && s.title, 140), artist: clip(s && s.artist, 140), noteEl: clip(s && s.noteEl, 400), noteEn: clip(s && s.noteEn, 400) }))
    .filter((s) => s.title && s.artist);
}
export function sanitizePolls(list) {
  return (Array.isArray(list) ? list : [])
    .map((p) => ({
      questionEl: clip(p && p.questionEl, 200), questionEn: clip(p && p.questionEn, 200),
      options: (Array.isArray(p && p.options) ? p.options : []).map((o) => ({ el: clip(o && o.el, 80), en: clip(o && o.en, 80) })).filter((o) => o.el || o.en).slice(0, 4),
    }))
    .filter((p) => (p.questionEl || p.questionEn) && p.options.length >= 2);
}

async function fromClaude(nSongs, nPolls) {
  const prompt = `You prepare weekly drafts for "The Van — Radio On Wheels", a Greek web-radio app about music, places and journeys (roads, ports, islands, travelling, memories).
Return ONLY a JSON object, no prose, with this exact shape:
{"songs":[{"title":"","artist":"","noteEl":"","noteEn":""}],"polls":[{"questionEl":"","questionEn":"","options":[{"el":"","en":""}]}]}
Rules:
- ${nSongs} songs. They must be REAL, well-known, officially released songs with the correct artist — if you are not certain a song exists, do not include it. Mix Greek and international music across eras. No links.
- noteEl / noteEn: one warm sentence (max 140 characters) connecting the song to journeys or places. noteEl in natural Greek, noteEn in natural English.
- ${nPolls} poll(s): a light, friendly question about travel, music or places; 3 short options (max 25 characters each) in both languages. No politics, no religion, nothing personal.`;
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 2000, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error("Claude API HTTP " + res.status);
  const data = await res.json();
  const text = (data.content || []).map((c) => c.text || "").join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Claude reply had no JSON");
  const parsed = JSON.parse(m[0]);
  return { songs: sanitizeSongs(parsed.songs), polls: sanitizePolls(parsed.polls) };
}

function fromSeeds() {
  const read = (f) => JSON.parse(fs.readFileSync(path.join(root, "content", f), "utf8"));
  return { songs: sanitizeSongs(read("seed-songs.json")), polls: sanitizePolls(read("seed-polls.json")) };
}

async function send(kind, item) {
  if (DRY) { console.log(`[dry-run] ${kind}:`, JSON.stringify(item)); return { ok: true, dry: true }; }
  const res = await fetch(WEBHOOK, { method: "POST", headers: { "content-type": "text/plain;charset=utf-8" }, body: JSON.stringify({ form_type: "content_draft", secret: SECRET, kind, item }) });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(`webhook refused ${kind}: ${data.error || res.status}`);
  return data;
}

export async function main() {
  if (!DRY && !SECRET) { console.error("CONTENT_WEBHOOK_SECRET is not set — nothing sent."); process.exitCode = 1; return; }
  let pool = null, source = "seed";
  if (API_KEY) {
    try { pool = await fromClaude(SONG_COUNT, POLL_COUNT); source = "claude"; }
    catch (e) { console.warn("Claude step failed, using the seed lists instead:", e.message); }
  }
  const seeds = fromSeeds();
  if (!pool || (!pool.songs.length && !pool.polls.length)) { pool = seeds; source = "seed"; }
  console.log(`Source: ${source}`);

  // Songs: the webhook skips ones already in the sheet (duplicate:true), so keep going until enough NEW drafts exist.
  let added = 0;
  const songCandidates = [...pool.songs, ...(source === "claude" ? seeds.songs : [])];
  for (const s of songCandidates) {
    if (added >= SONG_COUNT) break;
    const r = await send("song", s);
    if (!r.duplicate) { added++; console.log("  + song draft:", s.title, "—", s.artist); } else console.log("  = already in the sheet:", s.title);
  }
  let polls = 0;
  const pollCandidates = [...pool.polls, ...(source === "claude" ? seeds.polls : [])];
  // Polls have no natural unique key; only add when the sheet has no pending/approved one is handled by you in the sheet,
  // so we add at most POLL_COUNT per run, rotating through the list by ISO week number.
  const week = Math.floor(Date.now() / (7 * 24 * 3600 * 1000));
  for (let i = 0; i < Math.min(POLL_COUNT, pollCandidates.length); i++) {
    const p = pollCandidates[(week + i) % pollCandidates.length];
    await send("poll", p); polls++; console.log("  + poll draft:", p.questionEn || p.questionEl);
  }
  console.log(`Done: ${added} song draft(s), ${polls} poll draft(s) — all Pending, awaiting your approval in the sheet.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.message); process.exitCode = 1; });
}
