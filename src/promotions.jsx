// THE VAN — Promotion Engine (internal promotion of our own content only).
//
// Data comes from the "Promotions" sheet through the existing Apps Script web app
// (GET ?action=promotions). Only Approved + currently-active rows are returned by
// the server, and everything is re-validated here (defence in depth). If there is
// nothing to show, or the request fails, a slot renders NOTHING (no empty cards).
//
// Targets (Target URL column):
//   "/atlas", "/route", ...  -> in-app section          (the 8 real app URLs)
//   "/journey/19"            -> opens Journey #19        (card image falls back to the Journey's image)
//   "/postcard/<id>"         -> opens that approved postcard in Van Atlas (same id as in the shared link)
//   "https://..."            -> external link (https only, new tab)
// Anything else is ignored.
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "./i18n.jsx";
import { trackEvent, trackOnce } from "./analytics.js";

export const PLACEMENTS = ["HOME_HERO", "HOME_FEATURED", "JOURNEYS_FEATURED", "ATLAS_FEATURED", "COMMUNITY_FEATURED"];

const CACHE_KEY = "tvr_promos_v1";
const CACHE_FRESH_MS = 5 * 60 * 1000;      // reuse for 5 minutes
const CACHE_STALE_OK_MS = 24 * 60 * 60 * 1000; // if offline, accept up to a day old
const FETCH_TIMEOUT_MS = 8000;

// ---------- data layer ----------

function readCache() {
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (!c || !Array.isArray(c.list) || typeof c.t !== "number") return null;
    return c;
  } catch (e) { return null; }
}
function writeCache(list) {
  try { window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), list })); } catch (e) { /* ignore */ }
}

function toDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export function normalizePromotion(raw) {
  if (!raw || typeof raw !== "object") return null;
  const p = {
    id: String(raw.id || "").trim(),
    title: String(raw.title || "").trim(),
    subtitle: String(raw.subtitle || "").trim(),
    imageUrl: String(raw.imageUrl || "").trim(),
    ctaEl: String(raw.ctaEl || "").trim(),
    ctaEn: String(raw.ctaEn || "").trim(),
    targetUrl: String(raw.targetUrl || "").trim(),
    placement: String(raw.placement || "").trim().toUpperCase(),
    type: String(raw.type || "").trim().toUpperCase(),
    priority: Number.isFinite(parseFloat(raw.priority)) ? parseFloat(raw.priority) : 100,
    start: toDate(raw.start),
    end: toDate(raw.end),
    status: String(raw.status || "").trim().toLowerCase(),
    language: String(raw.language || "").trim().toUpperCase(),
  };
  if (!p.id || !p.title) return null;
  if (PLACEMENTS.indexOf(p.placement) === -1) return null;
  return p;
}

// Only approved, inside the date window, matching language. Sorted by priority
// (1 = first), then newest start date first.
export function selectPromotions(list, placement, lang, now) {
  const at = now || new Date();
  const L = lang === "en" ? "EN" : "EL";
  return (list || [])
    .filter((p) => p && p.placement === placement)
    .filter((p) => p.status === "approved")
    .filter((p) => !p.start || p.start <= at)
    .filter((p) => !p.end || p.end >= at)
    .filter((p) => !p.language || p.language === "ALL" || p.language === L)
    .sort((a, b) => (a.priority - b.priority) || ((b.start ? b.start.getTime() : 0) - (a.start ? a.start.getTime() : 0)));
}

export function resolveTarget(targetUrl, resolveTab) {
  const u = String(targetUrl || "").trim();
  if (!u) return null;
  if (/^https:\/\//i.test(u)) {
    try { new URL(u); return { kind: "external", href: u }; } catch (e) { return null; }
  }
  const j = u.match(/^\/?journey[\/:](\d+)\/?$/i);
  if (j) return { kind: "journey", id: parseInt(j[1], 10) };
  const pc = u.match(/^\/?postcard[\/:]([\w.:-]{1,100})\/?$/i);
  if (pc) return { kind: "postcard", id: pc[1] };
  if (u.charAt(0) === "/") {
    const tab = resolveTab ? resolveTab(u) : null;
    return tab ? { kind: "tab", tab } : null;
  }
  return null;
}

export async function fetchPromotions(webhookUrl) {
  if (!webhookUrl || webhookUrl.includes("PASTE_")) return [];
  const cached = readCache();
  if (cached && Date.now() - cached.t < CACHE_FRESH_MS) return cached.list.map(normalizePromotion).filter(Boolean);
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS) : null;
  try {
    const res = await fetch(`${webhookUrl}?action=promotions`, ctrl ? { signal: ctrl.signal } : undefined);
    if (!res.ok) throw new Error("promotions HTTP " + res.status);
    const data = await res.json();
    if (!data || data.ok !== true || !Array.isArray(data.promotions)) throw new Error("promotions malformed");
    const list = data.promotions.map(normalizePromotion).filter(Boolean);
    writeCache(list.map((p) => ({ ...p, start: p.start ? p.start.toISOString() : null, end: p.end ? p.end.toISOString() : null })));
    return list;
  } catch (e) {
    if (cached && Date.now() - cached.t < CACHE_STALE_OK_MS) return cached.list.map(normalizePromotion).filter(Boolean);
    return [];
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ---------- context ----------

const PromotionsContext = createContext({ list: [], actions: null });

// `actions`: { navigate(tab), openJourney(id), openPostcard(id), resolveTab(path) -> tab|null, getJourney(id) -> journey|undefined }
export function PromotionsProvider({ webhookUrl, actions, children }) {
  const [list, setList] = useState([]);
  useEffect(() => {
    let cancelled = false;
    fetchPromotions(webhookUrl)
      .then((l) => { if (!cancelled) setList(Array.isArray(l) ? l : []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [webhookUrl]);
  const value = useMemo(() => ({ list, actions }), [list, actions]);
  return <PromotionsContext.Provider value={value}>{children}</PromotionsContext.Provider>;
}

function usePromotionsForSlot(placement) {
  const { list, actions } = useContext(PromotionsContext);
  const { lang } = useLang();
  return useMemo(() => {
    if (!actions) return [];
    return selectPromotions(list, placement, lang)
      .map((p) => {
        const target = resolveTarget(p.targetUrl, actions.resolveTab);
        if (!target) return null;
        if (target.kind === "postcard" && !actions.openPostcard) return null;
        let journey = null;
        if (target.kind === "journey") {
          journey = actions.getJourney ? actions.getJourney(target.id) : null;
          if (!journey) return null; // journey no longer exists -> hide, never show a dead card
        }
        return { promo: p, target, journey };
      })
      .filter(Boolean);
  }, [list, actions, placement, lang]);
}

// ---------- UI ----------

function PromoCard({ item, variant, placement }) {
  const { lang, t } = useLang();
  const { actions } = useContext(PromotionsContext);
  const { promo, target, journey } = item;
  const img = promo.imageUrl || (journey && journey.imageUrl) || "";
  const cta = (lang === "en" ? promo.ctaEn : promo.ctaEl) || t("promo.ctaDefault");
  const kicker = promo.type ? t("promo.type." + promo.type) : "";
  const showKicker = kicker && kicker !== "promo.type." + promo.type;
  const style = img
    ? { backgroundImage: `linear-gradient(180deg, rgba(8,23,31,0.10) 0%, rgba(8,23,31,0.62) 55%, rgba(8,23,31,0.94) 100%), url("${img.replace(/"/g, "%22")}")` }
    : undefined;
  const body = (
    <>
      {showKicker && <span className="promo-kicker">{kicker}</span>}
      <span className="promo-body">
        <span className="promo-title">{promo.title}</span>
        {promo.subtitle && <span className="promo-sub">{promo.subtitle}</span>}
        <span className="promo-cta">{cta} <span aria-hidden="true">→</span></span>
      </span>
    </>
  );
  const cls = `promo-card promo-${variant}${img ? " promo-has-img" : ""}`;
  // Impression: counted once per session per promotion+placement, when at least half of the card is on screen.
  const cardRef = useRef(null);
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return undefined;
    const fire = () => trackOnce(`promo-imp:${promo.id}:${placement}`, "promo_impression", { id: promo.id, placement });
    if (typeof IntersectionObserver === "undefined") { fire(); return undefined; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.5)) { fire(); io.disconnect(); }
    }, { threshold: [0.5] });
    io.observe(el);
    return () => io.disconnect();
  }, [promo.id, placement]);
  const click = () => trackEvent("promo_click", { id: promo.id, placement, target: target.kind });
  if (target.kind === "external") {
    return <a ref={cardRef} className={cls} style={style} href={target.href} target="_blank" rel="noopener noreferrer" onClick={click}>{body}</a>;
  }
  const onClick = () => {
    click();
    if (!actions) return;
    if (target.kind === "tab") actions.navigate(target.tab);
    else if (target.kind === "journey") actions.openJourney(target.id);
    else if (target.kind === "postcard" && actions.openPostcard) actions.openPostcard(target.id);
  };
  return <button ref={cardRef} type="button" className={cls} style={style} onClick={onClick}>{body}</button>;
}

// variant: "hero" (single large card), "list" (section with cards), "strip" (single slim card)
export function PromotionSlot({ placement, variant = "list", titleKey, max }) {
  const items = usePromotionsForSlot(placement);
  const { t } = useLang();
  if (!items.length) return null; // graceful: nothing active -> nothing rendered
  const shown = variant === "list" ? items.slice(0, max || 4) : items.slice(0, 1);
  return (
    <section className={`promo-slot promo-slot-${variant}`} aria-label={titleKey ? t(titleKey) : undefined}>
      {titleKey && variant === "list" && <h2 className="promo-section-title">{t(titleKey)}</h2>}
      <div className={variant === "list" ? "promo-list" : undefined}>
        {shown.map((it) => <PromoCard key={it.promo.id} item={it} variant={variant} placement={placement} />)}
      </div>
    </section>
  );
}

// Editorial, low-key prompts that encourage participation (not banners).
const COMMUNITY_ITEMS = {
  route: { target: "route" },
  postcards: { target: "postcards" },
  atlas: { target: "atlas" },
  journeys: { target: "journeys" },
  share: { target: null },
};

export function CommunityPrompts({ items = ["route", "postcards", "atlas", "journeys", "share"], withTitle = true }) {
  const { t } = useLang();
  const { actions } = useContext(PromotionsContext);
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  if (!actions) return null;

  async function share() {
    const url = window.location.origin + "/";
    const text = t("share.appText");
    try {
      if (navigator.share) { await navigator.share({ title: text, text, url }); return; }
    } catch (e) {
      if (e && e.name === "AbortError") return; // user closed the share sheet
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2200);
    } catch (e) { /* clipboard unavailable: nothing else to do silently */ }
  }

  return (
    <section className="community-prompts" aria-label={t("community.title")}>
      {withTitle && <h2 className="promo-section-title">{t("community.title")}</h2>}
      <div className="community-list">
        {items.filter((k) => COMMUNITY_ITEMS[k]).map((k) => (
          <button
            key={k}
            type="button"
            className="community-row"
            onClick={() => (k === "share" ? share() : actions.navigate(COMMUNITY_ITEMS[k].target))}
          >
            <span className="community-row-text">
              <span className="community-row-title">{t(`community.${k}.title`)}</span>
              <span className="community-row-sub">{k === "share" && copied ? t("community.share.copied") : t(`community.${k}.text`)}</span>
            </span>
            <span className="community-row-cta">{t(`community.${k}.cta`)} <span aria-hidden="true">→</span></span>
          </button>
        ))}
      </div>
    </section>
  );
}

export const PROMO_CSS = `
/* ---- Language toggle (compact pill, same family as Co-pilot / Live) ---- */
/* Sits in its own slim row UNDER the Co-pilot/Live pills (right-aligned), so the logo and the original pills keep their exact position. */
.top-action-bar .lang-toggle { position: absolute; top: calc(100% + 8px); right: 0; padding: 4px 10px; gap: 5px; font-size: 11px; letter-spacing: 0.02em; }
.lang-toggle .lang-on { color: var(--accent); }
.lang-toggle .lang-off { color: var(--text-dim); font-weight: 600; }
.lang-toggle .lang-sep { color: var(--border); font-weight: 400; }

/* ---- Promotion Engine ---- */
.promo-slot { margin: 0 0 14px; }
.promo-section-title {
  font-family: 'Poppins', sans-serif; font-size: 15px; font-weight: 700;
  margin: 8px 0 10px; letter-spacing: 0.01em;
}
.promo-list { display: flex; flex-direction: column; gap: 10px; }
.promo-card {
  position: relative; display: flex; flex-direction: column; justify-content: flex-end; text-align: left;
  width: 100%; min-height: 108px; padding: 14px 16px; box-sizing: border-box; overflow: hidden;
  border-radius: 18px; border: 1px solid rgba(46,208,242,0.38);
  background-color: #08171f; background-size: cover; background-position: center;
  color: var(--text); cursor: pointer; text-decoration: none; font-family: inherit;
}
.promo-card:not(.promo-has-img) { background-image: linear-gradient(135deg, #0c2430 0%, #08171f 70%); }
.promo-hero { min-height: 190px; }
.promo-strip { min-height: 0; padding: 12px 16px; margin-bottom: 4px; }
.promo-kicker {
  position: absolute; top: 12px; left: 14px;
  font-size: 10.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--accent); background: rgba(10,13,11,0.62); border: 1px solid rgba(57,172,208,0.45);
  border-radius: 999px; padding: 4px 9px; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
}
.promo-strip .promo-kicker, .promo-card:not(.promo-has-img) .promo-kicker { position: static; align-self: flex-start; margin-bottom: 8px; }
.promo-body { display: flex; flex-direction: column; gap: 3px; }
.promo-title { font-family: 'Poppins', sans-serif; font-size: 17px; font-weight: 700; line-height: 1.25; }
.promo-hero .promo-title { font-size: 20px; }
.promo-sub { font-size: 13px; color: rgba(242,241,236,0.82); line-height: 1.4; }
.promo-cta { margin-top: 6px; font-size: 12.5px; font-weight: 700; color: var(--accent); }

/* ---- Community prompts: editorial rows, not banners ---- */
.community-prompts { margin: 22px 0 8px; }
.community-list { border-top: 1px solid var(--border); }
.community-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%;
  padding: 13px 2px; background: none; border: none; border-bottom: 1px solid var(--border);
  color: var(--text); text-align: left; cursor: pointer; font-family: inherit;
}
.community-row-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.community-row-title { font-size: 14.5px; font-weight: 600; }
.community-row-sub { font-size: 12.5px; color: var(--text-dim); line-height: 1.4; }
.community-row-cta { flex-shrink: 0; font-size: 12px; font-weight: 700; color: var(--accent); white-space: nowrap; }
.community-row:hover .community-row-title { color: var(--accent); }
`;
