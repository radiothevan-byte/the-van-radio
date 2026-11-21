// Sends the push notifications that are due. Called every ~5 minutes by an external scheduler
// (cron-job.org), because GitHub's own schedule runs only every few hours on this repo.
// The sending logic is the same one the GitHub Action uses (scripts/send-push.mjs).
//
// Security: requires   Authorization: Bearer <PUSH_TICK_KEY>   (or ?key=<PUSH_TICK_KEY>).
// Environment variables (Vercel project settings — never committed):
//   PUSH_TICK_KEY, PUSH_SENDER_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY   (VAPID_SUBJECT optional)
// The response never contains secrets, endpoints or subscriber data — only counts.
import crypto from "node:crypto";
import { runPush } from "../scripts/send-push.mjs";

function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function authorised(req, tickKey) {
  if (!tickKey) return false;
  const h = String(req.headers?.authorization || "");
  const bearer = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  let q = "";
  try { q = new URL(req.url, "http://x").searchParams.get("key") || ""; } catch { /* ignore */ }
  return (bearer && same(bearer, tickKey)) || (q && same(q, tickKey));
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const env = process.env;
  if (!env.PUSH_TICK_KEY || !env.PUSH_SENDER_SECRET || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    res.statusCode = 503; res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ ok: false, error: "not-configured" }));
  }
  if (!authorised(req, env.PUSH_TICK_KEY)) {
    res.statusCode = 401; res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ ok: false, error: "unauthorised" }));
  }
  const dry = new URL(req.url, "http://x").searchParams.get("dry") === "1";
  try {
    const out = await runPush({
      secret: env.PUSH_SENDER_SECRET, pub: env.VAPID_PUBLIC_KEY, priv: env.VAPID_PRIVATE_KEY,
      subject: env.VAPID_SUBJECT || "mailto:radiothevan@gmail.com", webhook: env.PUSH_WEBHOOK_URL || undefined, dry, log: () => {},
    });
    res.statusCode = 200; res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, dry, due: out.due, subscriptions: out.subscriptions, sent: out.sent, expired: out.expired }));
  } catch (e) {
    res.statusCode = 502; res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: String(e.message || e).slice(0, 120) }));
  }
}
