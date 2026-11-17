// Sends the notifications that are due (approved in the Google Sheet) to subscribed browsers.
// Runs every ~15 minutes from .github/workflows/send-push.yml. It decides nothing by itself:
// Apps Script returns only rows that are Status = "Approved" and due, plus the subscriptions.
//
// Environment (GitHub Actions secrets — never committed):
//   PUSH_SENDER_SECRET   required  (== Script Property PUSH_SENDER_SECRET in Apps Script)
//   VAPID_PUBLIC_KEY     required
//   VAPID_PRIVATE_KEY    required
//   VAPID_SUBJECT        optional  (default mailto:radiothevan@gmail.com)
//   PUSH_WEBHOOK_URL     optional  (default: the app's public Apps Script /exec URL)
//   DRY_RUN=1            optional  (counts recipients, sends nothing, reports nothing back)
import { sendWebPush } from "./webpush.mjs";

const WEBHOOK = process.env.PUSH_WEBHOOK_URL || "https://script.google.com/macros/s/AKfycbzKzq7vKbWAw6PwmGoPenTpv194K_64CfcY3Gd5KcGDduu6H8z1FNmgt6z11aCMlghujg/exec";
const SECRET = process.env.PUSH_SENDER_SECRET || "";
const PUB = process.env.VAPID_PUBLIC_KEY || "";
const PRIV = process.env.VAPID_PRIVATE_KEY || "";
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:radiothevan@gmail.com";
const DRY = process.env.DRY_RUN === "1";


async function call(body) {
  const res = await fetch(WEBHOOK, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ ...body, key: SECRET }), redirect: "follow" });
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw new Error("Apps Script returned non-JSON: " + text.slice(0, 120)); }
}

// Only same-site paths may be opened by a notification.
export function safeUrl(u) {
  const s = String(u || "/");
  return s.startsWith("/") && !s.startsWith("//") && !/[\\\s]/.test(s) ? s.slice(0, 200) : "/";
}
export function buildPayload(n, lang) {
  const en = lang === "en";
  const title = (en ? n.titleEn || n.titleEl : n.titleEl || n.titleEn) || "THE VAN";
  const body = (en ? n.bodyEn || n.bodyEl : n.bodyEl || n.bodyEn) || "";
  return JSON.stringify({ title: title.slice(0, 80), body: body.slice(0, 160), url: safeUrl(n.url), tag: n.id, topic: n.topic });
}

async function main() {
  if (!SECRET || !PUB || !PRIV) throw new Error("Missing PUSH_SENDER_SECRET / VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY");
  const due = await call({ form_type: "push_due", dry_run: DRY });
  if (!due || !due.ok) throw new Error("push_due failed: " + JSON.stringify(due));
  const notes = due.notifications || [];
  const subs = due.subscriptions || [];
  console.log(`due notifications: ${notes.length}, active subscriptions: ${subs.length}`);
  if (!notes.length) return;

  const sent = [], expired = new Set();
  for (const n of notes) {
    const targets = subs.filter((s) => (s.topics || []).includes(n.topic));
    let ok = 0, fail = 0;
    const queue = targets.slice();
    const worker = async () => {
      while (queue.length) {
        const s = queue.shift();
        if (DRY) { ok++; continue; }
        try {
          const r = await sendWebPush({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, buildPayload(n, s.lang),
            { subject: SUBJECT, publicKey: PUB, privateKey: PRIV, ttl: n.topic === "shows" ? 3600 : 6 * 3600, topic: undefined });
          if (r.ok) ok++; else { fail++; if (r.gone) expired.add(s.endpoint); }
        } catch (e) { fail++; }
      }
    };
    await Promise.all(Array.from({ length: Math.min(8, targets.length) || 0 }, worker));
    console.log(`${n.id} [${n.topic}] -> ${ok} sent, ${fail} failed (of ${targets.length})`);
    sent.push({ id: n.id, recipients: ok, failed: fail });
  }
  if (DRY) { console.log("DRY_RUN: nothing reported back"); return; }
  const rep = await call({ form_type: "push_report", sent, expired: Array.from(expired) });
  if (!rep || !rep.ok) throw new Error("push_report failed: " + JSON.stringify(rep));
  console.log(`reported: ${sent.length} notification(s), ${expired.size} expired subscription(s)`);
}

import { fileURLToPath } from "node:url";
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
