// Van Atlas: the location Bottom Sheet.
// Opens above the map when a pin / cluster is chosen (instead of listing the entries below the map).
// Three states: collapsed (name + number of entries), expanded (default) and full height.
// The map stays mounted underneath; this component only presents the entries it is given
// (every entry is rendered by the existing AtlasEntryCard, passed in as `renderEntry`),
// so no user content is shortened, rewritten or dropped.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLang } from "./i18n.jsx";

const COLLAPSED_H = 96;
const SNAPS = ["collapsed", "half", "full"];

function Ico({ children, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
const PinIcon = () => <Ico size={22}><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></Ico>;
const NoteIcon = () => <Ico size={17}><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></Ico>;
const CardIcon = () => <Ico size={17}><rect x="2.5" y="5" width="19" height="14" rx="2" /><rect x="15" y="8" width="4" height="4" rx=".6" /><path d="M5.5 9h6M5.5 12h6M5.5 15h9" /></Ico>;

function prefersReducedMotion() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; }
}

export default function AtlasSheet({ groups, panelLimit, onMore, onClose, renderEntry }) {
  const { t } = useLang();
  const [snap, setSnap] = useState("half");
  const [dragH, setDragH] = useState(null);       // px while a finger / mouse is dragging, else null
  const sheetRef = useRef(null);
  const bodyRef = useRef(null);
  const titleRef = useRef(null);
  const drag = useRef(null);
  const suppressClick = useRef(false);
  const opener = useRef(typeof document !== "undefined" ? document.activeElement : null);
  const key = groups.map((g) => g.name).join("|");

  const total = useMemo(() => groups.reduce((n, g) => n + g.entries.length, 0), [groups]);
  const songs = useMemo(() => groups.reduce((n, g) => n + g.entries.filter((e) => e.kind === "route").length, 0), [groups]);
  const cards = total - songs;
  const single = groups.length === 1;
  const title = single ? groups[0].name : t("atlas.sheet.places", { n: groups.length });
  const parts = [t(total === 1 ? "atlas.sheet.entries1" : "atlas.sheet.entriesN", { n: total })];
  if (songs) parts.push(t(songs === 1 ? "atlas.sheet.songs1" : "atlas.sheet.songsN", { n: songs }));
  if (cards) parts.push(t(cards === 1 ? "atlas.sheet.cards1" : "atlas.sheet.cardsN", { n: cards }));

  // A different location was picked while the sheet is open: show it from the top, in the default state.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    setSnap("half"); setDragH(null);
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [key]);

  // Keyboard / focus: move focus into the sheet, Escape closes, focus goes back when it closes.
  useEffect(() => {
    const prev = opener.current;
    try { if (titleRef.current) titleRef.current.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    function onKey(e) {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      try { if (prev && prev.isConnected && typeof prev.focus === "function") prev.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    };
  }, [onClose]);

  // The sheet sits right above the tab bar - and above the mini player while one is showing.
  const [bottom, setBottom] = useState(null);
  useLayoutEffect(() => {
    function measure() {
      const mini = document.querySelector(".app-root .mini-player");
      const tab = document.querySelector(".app-root .tab-bar");
      const edge = mini ? mini.getBoundingClientRect().top : tab ? tab.getBoundingClientRect().top : null;
      setBottom(edge == null ? null : Math.max(0, Math.round(window.innerHeight - edge)));
    }
    measure();
    window.addEventListener("resize", measure);
    let ro = null;
    try {
      if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(measure);
        document.querySelectorAll(".app-root .mini-player, .app-root .tab-bar").forEach((n) => ro.observe(n));
      }
    } catch (e) { /* ignore */ }
    const iv = setInterval(measure, 600);   // the mini player can appear / disappear while the sheet is open
    return () => { window.removeEventListener("resize", measure); if (ro) ro.disconnect(); clearInterval(iv); };
  }, []);

  // Heights available right now (the sheet sits above the tab bar / mini player and below the top edge).
  const limits = useCallback(() => {
    const el = sheetRef.current;
    const vh = window.innerHeight;
    const bottom = el ? el.getBoundingClientRect().bottom : vh;
    const full = Math.max(COLLAPSED_H + 80, Math.round(bottom - 12));
    const half = Math.min(full, Math.round(Math.max(vh * 0.5, COLLAPSED_H + 160)));
    return { collapsed: COLLAPSED_H, half, full };
  }, []);

  const go = (next) => { setDragH(null); setSnap(next); };
  const step = (dir) => {
    const i = SNAPS.indexOf(snap);
    go(SNAPS[Math.max(0, Math.min(SNAPS.length - 1, i + dir))]);
  };

  // ---- drag / swipe on the handle + header ----
  function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest && e.target.closest(".atlas-sheet-actions")) return;   // header buttons keep their own click
    const el = sheetRef.current; if (!el) return;
    drag.current = { y: e.clientY, h: el.getBoundingClientRect().height, t: e.timeStamp, lastY: e.clientY, lastT: e.timeStamp, v: 0, moved: false, id: e.pointerId };
  }
  function onPointerMove(e) {
    const d = drag.current; if (!d || d.id !== e.pointerId) return;
    const dy = d.y - e.clientY;
    if (!d.moved && Math.abs(dy) < 6) return;
    if (!d.moved) { try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
    d.moved = true;
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.v = (d.lastY - e.clientY) / dt;     // px/ms, positive = moving up
    d.lastY = e.clientY; d.lastT = e.timeStamp;
    const L = limits();
    setDragH(Math.max(24, Math.min(L.full, d.h + dy)));
  }
  function onPointerUp(e) {
    const d = drag.current; drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (!d.moved) return;
    suppressClick.current = true;
    setTimeout(() => { suppressClick.current = false; }, 0);
    const L = limits();
    const h = Math.max(24, Math.min(L.full, d.h + (d.y - e.clientY)));
    if (h < COLLAPSED_H * 0.6 && d.v <= 0.1) { onClose(); return; }
    const projected = h + d.v * 160;               // a quick flick carries on a little
    const best = SNAPS.reduce((a, s) => (Math.abs(L[s] - projected) < Math.abs(L[a] - projected) ? s : a), "half");
    go(best);
  }
  function onHandleClick() {
    if (suppressClick.current) return;
    go(snap === "collapsed" ? "half" : snap === "half" ? "full" : "half");
  }
  function onHandleKey(e) {
    if (e.key === "ArrowUp") { e.preventDefault(); step(1); }
    else if (e.key === "ArrowDown") { e.preventDefault(); step(-1); }
  }

  // ---- content ----
  let shown = 0;
  const sections = groups.map((g, gi) => {
    if (shown >= panelLimit) return null;
    const room = panelLimit - shown;
    const visible = g.entries.slice(0, room);
    shown += visible.length;
    const routes = visible.filter((e) => e.kind === "route");
    const postcards = visible.filter((e) => e.kind !== "route");
    return (
      <div key={gi} className="atlas-sheet-place-block">
        {!single && <div className="atlas-sheet-place">{g.name}{g.entries.length > 1 ? ` · ${g.entries.length}` : ""}</div>}
        {routes.length > 0 && (
          <section className="atlas-sheet-section">
            <h3 className="atlas-sheet-h"><NoteIcon /><span>{t("atlas.sheet.routes")}</span></h3>
            {routes.map((e, i) => <div className="atlas-sheet-entry" key={e.kind + ":" + e.id + ":" + i}>{renderEntry(e)}</div>)}
          </section>
        )}
        {postcards.length > 0 && (
          <section className="atlas-sheet-section">
            <h3 className="atlas-sheet-h"><CardIcon /><span>{t("atlas.sheet.cards")}</span></h3>
            {postcards.map((e, i) => <div className="atlas-sheet-entry" key={e.kind + ":" + e.id + ":" + i}>{renderEntry(e)}</div>)}
          </section>
        )}
      </div>
    );
  });

  const collapsed = snap === "collapsed" && dragH == null;
  const style = { ...(bottom != null ? { "--sheet-bottom": bottom + "px" } : null), ...(dragH != null ? { height: dragH } : null) };
  const node = (
    <div
      ref={sheetRef}
      className={`atlas-sheet ${dragH != null ? "atlas-sheet-dragging" : ""}`}
      data-snap={snap}
      style={style}
      role="dialog"
      aria-modal="false"
      aria-label={title}
    >
      <div
        className="atlas-sheet-drag"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <button
          type="button"
          className="atlas-sheet-grab"
          onClick={onHandleClick}
          onKeyDown={onHandleKey}
          aria-expanded={snap !== "collapsed"}
          aria-label={snap === "collapsed" ? t("atlas.sheet.expand") : t("atlas.sheet.collapse")}
        >
          <span className="atlas-sheet-grab-bar" aria-hidden="true" />
        </button>
        <div className="atlas-sheet-head">
          <span className="atlas-sheet-pin"><PinIcon /></span>
          <div className="atlas-sheet-titles">
            <h2 className="atlas-sheet-title" ref={titleRef} tabIndex={-1}>{title}</h2>
            <div className="atlas-sheet-sub">{parts.join(" · ")}</div>
          </div>
          <div className="atlas-sheet-actions">
            <button type="button" className="atlas-sheet-btn atlas-sheet-btn-size" onClick={() => go(snap === "full" ? "half" : "full")}
              aria-label={snap === "full" ? t("atlas.sheet.half") : t("atlas.sheet.full")} title={snap === "full" ? t("atlas.sheet.half") : t("atlas.sheet.full")}>
              <Ico size={17}>{snap === "full" ? <><path d="M4 14h6v6" /><path d="M20 10h-6V4" /><path d="m14 10 7-7" /><path d="m3 21 7-7" /></> : <><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="m21 3-7 7" /><path d="m3 21 7-7" /></>}</Ico>
            </button>
            <button type="button" className="atlas-sheet-btn atlas-sheet-btn-fold" onClick={() => go(collapsed ? "half" : "collapsed")}
              aria-expanded={!collapsed} aria-label={collapsed ? t("atlas.sheet.expand") : t("atlas.sheet.collapse")} title={collapsed ? t("atlas.sheet.expand") : t("atlas.sheet.collapse")}>
              <Ico size={18}>{collapsed ? <path d="m18 15-6-6-6 6" /> : <path d="m6 9 6 6 6-6" />}</Ico>
            </button>
            <button type="button" className="atlas-sheet-btn" onClick={onClose} aria-label={t("atlas.sheet.close")} title={t("atlas.sheet.close")}>
              <Ico size={18}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></Ico>
            </button>
          </div>
        </div>
      </div>
      {!collapsed && (
        <div className="atlas-sheet-body" ref={bodyRef}>
          {sections}
          {total > panelLimit && (
            <button type="button" className="postcard-map-toggle atlas-sheet-more" onClick={onMore}>
              {t("atlas.more", { n: total - panelLimit })}
            </button>
          )}
        </div>
      )}
    </div>
  );
  const host = typeof document !== "undefined" ? document.querySelector(".app-root") : null;
  return host ? createPortal(node, host) : node;
}
