// THE VAN — engagement events (privacy first).
//
// - Built on Vercel Web Analytics custom events: cookieless, no cross-site tracking, no fingerprinting.
// - Events carry only coarse, non-personal values: an event name plus things like a journey number,
//   a promotion id, a placement, or "journey"/"postcard". Never names, texts, coordinates, photos,
//   postcard ids, song titles typed by people, e-mails or any user-generated content.
// - Nothing is sent when the browser says Do Not Track / Global Privacy Control.
// - Every call is fire-and-forget inside try/catch: analytics can never break the app.
// - Custom events need a Vercel plan that includes them; on other plans the calls are simply ignored.
import { track } from "@vercel/analytics";

// "Returning visitors": a single boolean flag ("this browser has opened the app before") is kept in
// localStorage and an event is sent when it was already there. No id, no timestamp, no fingerprint.
// Storing even that flag for analytics may need to be mentioned in your privacy notice / consent
// banner (ePrivacy). Set to false to turn the returning-visit event off entirely.
export const TRACK_RETURNING_VISITS = true;

function optedOut() {
  try {
    if (typeof navigator === "undefined") return false;
    return navigator.doNotTrack === "1" || window.doNotTrack === "1" || navigator.globalPrivacyControl === true;
  } catch (e) { return false; }
}

function cleanProps(props) {
  const out = {};
  if (!props || typeof props !== "object") return out;
  Object.keys(props).slice(0, 8).forEach((k) => {
    const v = props[k];
    if (typeof v === "string") out[k] = v.slice(0, 64);
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean") out[k] = v;
  });
  return out;
}

export function trackEvent(name, props) {
  try {
    if (optedOut()) return;
    track(String(name).slice(0, 40), cleanProps(props));
  } catch (e) { /* never break the app */ }
}

const onceKeys = new Set();
// Same event only once per page session (e.g. promotion impressions).
export function trackOnce(key, name, props) {
  if (onceKeys.has(key)) return;
  onceKeys.add(key);
  trackEvent(name, props);
}

export function trackReturningVisit() {
  if (!TRACK_RETURNING_VISITS || optedOut()) return;
  try {
    const k = "tvr_seen";
    if (window.localStorage.getItem(k)) trackEvent("returning_visit");
    else window.localStorage.setItem(k, "1");
  } catch (e) { /* storage unavailable: skip */ }
}

// PWA: install availability and installation. We do not call preventDefault, so the browser's own
// install UI keeps working exactly as before.
export function trackPwaEvents() {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", () => trackOnce("pwa-prompt", "pwa_install_prompt"));
  window.addEventListener("appinstalled", () => trackEvent("pwa_installed"));
}
