// THE VAN — push notifications opt-in (P7).
//
// A small card on Home. The visitor chooses what to receive:
//   "shows" = Saturday broadcasts, "news" = new suggestions from The Van (song of the day, poll, ...).
// Nothing is asked until the visitor taps the button. The browser subscription is sent to the Apps Script
// webhook (sheet "Push Subscriptions"); what is actually sent is approved by the owner in the sheet "Push Outbox".
// Works on Android/desktop browsers; on iPhone/iPad only after "Add to Home Screen" (iOS 16.4+).
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLang } from "./i18n.jsx";
import { trackEvent } from "./analytics.js";

// PUBLIC key (safe to ship). The matching private key lives only in the GitHub secret VAPID_PRIVATE_KEY.
export const VAPID_PUBLIC_KEY = "BG1zbCDVULO5R-SDake-k5GyRt4cFRK1pyTIcgDirtWE3hzbtjMWQXj-8kWLdt9ZBvMHATYrdTApMiSi9fOS5DQ";

const LS_TOPICS = "tvr_push_topics";
const LS_LANG = "tvr_push_lang";
const ALL_TOPICS = ["shows", "news"];

function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { if (v === null) window.localStorage.removeItem(k); else window.localStorage.setItem(k, v); } catch (e) { /* ignore */ } }

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}
function isIOS() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  return /iPad|iPhone|iPod/.test(ua) || (typeof navigator !== "undefined" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
function isStandalone() {
  try { return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true; } catch (e) { return false; }
}
function urlB64ToBytes(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
function readTopics() {
  try {
    const v = JSON.parse(lsGet(LS_TOPICS) || "null");
    const t = Array.isArray(v) ? v.filter((x) => ALL_TOPICS.includes(x)) : [];
    return t.length ? t : ALL_TOPICS.slice();
  } catch (e) { return ALL_TOPICS.slice(); }
}
function withTimeout(p, ms) {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => { clearTimeout(id); resolve(v); }, (e) => { clearTimeout(id); reject(e); });
  });
}
async function postWebhook(url, body) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!data || data.ok !== true) throw new Error((data && data.error) || "failed");
  return data;
}

export function NotificationsBell({ webhookUrl }) {
  const { lang, t } = useLang();
  const [status, setStatus] = useState("loading");   // loading | hidden | ios | off | denied | on
  const [topics, setTopics] = useState(readTopics);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const register = useCallback(async (sub, list) => {
    await postWebhook(webhookUrl, { form_type: "push_subscribe", subscription: sub.toJSON(), topics: list, lang });
    lsSet(LS_TOPICS, JSON.stringify(list));
    lsSet(LS_LANG, lang);
  }, [webhookUrl, lang]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!pushSupported()) { if (alive) setStatus(isIOS() && !isStandalone() ? "ios" : "hidden"); return; }
      if (Notification.permission === "denied") { if (alive) setStatus("denied"); return; }
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (!alive) return;
        if (sub && Notification.permission === "granted") {
          setStatus("on");
          if (lsGet(LS_LANG) !== lang) register(sub, readTopics()).catch(() => {});   // keep the notification language in sync
        } else setStatus("off");
      } catch (e) { if (alive) setStatus("off"); }
    })();
    return () => { alive = false; };
  }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const enable = useCallback(async () => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setStatus(perm === "denied" ? "denied" : "off"); return; }
      const reg = await withTimeout(navigator.serviceWorker.ready, 8000);
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToBytes(VAPID_PUBLIC_KEY) });
      const list = topics.length ? topics : ALL_TOPICS.slice();
      try { await register(sub, list); }
      catch (e) { await sub.unsubscribe().catch(() => {}); throw e; }
      setTopics(list); setStatus("on");
      trackEvent("push_enable", { topics: list.join("+") });
    } catch (e) { setError(t("push.error")); }
    finally { setBusy(false); }
  }, [busy, topics, register, t]);

  const disable = useCallback(async () => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe().catch(() => {});
        postWebhook(webhookUrl, { form_type: "push_unsubscribe", endpoint }).catch(() => {});
      }
      lsSet(LS_LANG, null);
      setStatus("off");
      trackEvent("push_disable");
    } catch (e) { setError(t("push.error")); }
    finally { setBusy(false); }
  }, [busy, webhookUrl, t]);

  const toggle = useCallback(async (topic) => {
    const next = topics.includes(topic) ? topics.filter((x) => x !== topic) : [...topics, topic];
    if (!next.length) { await disable(); return; }
    setTopics(next); setError("");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) await register(sub, next);
    } catch (e) { setError(t("push.error")); setTopics(topics); }
  }, [topics, disable, register, t]);

  if (status === "loading" || status === "hidden") return null;
  const bell = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={status === "on" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
      {status === "denied" && <path d="M3 3l18 18" />}
    </svg>
  );
  return (
    <div className="push-wrap" ref={wrapRef}>
      <button type="button" className={`top-action-btn push-bell ${status === "on" ? "push-bell-on" : ""}`} onClick={() => setOpen((o) => !o)}
        aria-label={t("push.kicker")} title={t("push.kicker")} aria-haspopup="dialog" aria-expanded={open}>{bell}</button>
      {open && (
        <div className="push-pop" role="dialog" aria-label={t("push.kicker")}>
          {status === "ios" && <p className="content-note">{t("push.ios")}</p>}
          {status === "denied" && <p className="content-note">{t("push.denied")}</p>}
          {status === "off" && (
            <>
              <div className="content-title">{t("push.title")}</div>
              <p className="content-note">{t("push.text")}</p>
              <button type="button" className="push-btn" onClick={enable} disabled={busy}>{t("push.enable")}</button>
            </>
          )}
          {status === "on" && (
            <>
              <div className="content-title">{t("push.on")}</div>
              <label className="push-row"><input type="checkbox" checked={topics.includes("shows")} onChange={() => toggle("shows")} /><span>{t("push.topic.shows")}</span></label>
              <label className="push-row"><input type="checkbox" checked={topics.includes("news")} onChange={() => toggle("news")} /><span>{t("push.topic.news")}</span></label>
              <button type="button" className="push-link" onClick={disable} disabled={busy}>{t("push.disable")}</button>
            </>
          )}
          {error && <p className="push-error" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}

export const PUSH_CSS = `
/* ---- Push notifications bell (top bar) ---- */
.push-wrap { position: relative; display: flex; }
.push-bell { padding: 8px 10px; }
.push-bell-on { color: #7fd4ee; border-color: rgba(57,172,208,0.9); }
/* the bell sits on the small row under Co-pilot / Live, immediately left of EL|EN (same row, same height) */
.top-action-bar .push-wrap { position: absolute; top: calc(100% + 8px); right: 74px; }
.top-action-bar .push-bell { padding: 4px 9px; }
.top-action-bar .push-pop { top: calc(100% + 8px); right: -74px; }
.push-pop { top: calc(100% + 8px); right: -74px; }
}
.push-pop {
  position: absolute; top: calc(100% + 8px); right: 0; width: min(280px, calc(100vw - 40px)); box-sizing: border-box;
  padding: 14px 16px 16px; border-radius: 16px; border: 1px solid var(--border); background: var(--surface);
  box-shadow: 0 12px 32px rgba(0,0,0,0.45); z-index: 30; display: flex; flex-direction: column; text-align: left;
}
.push-pop .content-title { font-size: 15px; font-weight: 700; }
.push-pop .content-note { margin: 6px 0 0; font-size: 13px; line-height: 1.45; color: rgba(242,241,236,0.75); }
.push-btn {
  margin-top: 10px; align-self: flex-start; padding: 10px 16px; border-radius: 999px; border: 1px solid rgba(57,172,208,0.7);
  background: rgba(10,13,11,0.55); color: var(--text); font-family: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer;
}
.push-btn:hover:not(:disabled) { background: var(--surface-2); }
.push-btn:disabled { opacity: .6; cursor: default; }
.push-row { display: flex; align-items: center; gap: 10px; margin-top: 8px; font-size: 14px; cursor: pointer; }
.push-row input { width: 18px; height: 18px; accent-color: var(--accent); }
.push-link { margin-top: 10px; align-self: flex-start; background: none; border: 0; padding: 0; color: rgba(242,241,236,0.7); font-family: inherit; font-size: 12.5px; text-decoration: underline; cursor: pointer; }
.push-error { margin: 8px 0 0; font-size: 12.5px; color: #ff9f8a; }
`;
