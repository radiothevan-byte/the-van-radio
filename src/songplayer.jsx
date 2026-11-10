// THE VAN — Song of the Day player (opens from the Song of the Day card on Home).
//
// Plays the song from the link in the Google Sheet:
//   * YouTube  -> official YouTube IFrame Player API (privacy-enhanced youtube-nocookie.com host),
//                 with our own play/pause + progress. The video frame stays visible (YouTube's rule).
//   * Spotify  -> Spotify's own embed (its controls; 30-second preview unless the visitor is signed in).
//   * anything else / blocked embed / API unreachable -> a plain "open in YouTube/Spotify" button.
// Nothing from YouTube or Spotify is loaded until the visitor opens the player.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLang } from "./i18n.jsx";
import { shareLink } from "./share.js";

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

export function parseSongLink(url) {
  let u;
  try { u = new URL(String(url || "")); } catch (e) { return null; }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = u.pathname.split("/")[1] || "";
    return YT_ID.test(id) ? { kind: "youtube", id } : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    let id = u.searchParams.get("v") || "";
    if (!id) { const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})/); id = m ? m[1] : ""; }
    return YT_ID.test(id) ? { kind: "youtube", id } : null;
  }
  if (host === "open.spotify.com") {
    const m = u.pathname.match(/^\/(?:intl-[a-z]{2}\/)?(track|episode)\/([A-Za-z0-9]{10,30})\/?$/);
    return m ? { kind: "spotify", type: m[1], id: m[2] } : null;
  }
  return null;
}

let ytApiPromise = null;
function loadYouTubeApi() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ytApiPromise = null; reject(new Error("YouTube API timeout")); }, 8000);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer);
      try { if (typeof prev === "function") prev(); } catch (e) { /* ignore */ }
      resolve(window.YT);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = () => { clearTimeout(timer); ytApiPromise = null; reject(new Error("YouTube API blocked")); };
    document.head.appendChild(s);
  });
  return ytApiPromise;
}

function fmt(sec) {
  const n = Number.isFinite(sec) && sec > 0 ? Math.floor(sec) : 0;
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}

function openUrl(link, parsed) {
  if (parsed && parsed.kind === "youtube") return `https://www.youtube.com/watch?v=${parsed.id}`;
  return link;
}

function ShareIcon() {
  return (
    <svg className="sp-shareicon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" /><path d="M16 6l-4-4-4 4" /><path d="M12 2v13" />
    </svg>
  );
}

function HeartIcon({ filled }) {
  return (
    <svg className="sp-heart" width="20" height="20" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg className="sp-star" width="40" height="40" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.6l2.9 6 6.5.9-4.7 4.6 1.1 6.5L12 17.5l-5.8 3.1 1.1-6.5L2.6 9.5l6.5-.9z" fill="#ffd23f" stroke="#ffd23f" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function SkipIcon({ dir }) {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={dir > 0 ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" />
      <text x="12" y="15.4" textAnchor="middle" fontSize="7.6" fontWeight="700" fill="currentColor" stroke="none" style={dir > 0 ? { transform: "scaleX(-1)", transformOrigin: "12px 12px" } : undefined}>15</text>
    </svg>
  );
}

// `onSave` is optional (no save button without it); `heading` is the handwritten title at the top;
// `trackPlay` is false for songs that are not the Song of the Day (no per-song analytics for those).
export function SongPlayerSheet({ song, parsed, saved, onSave, onClose, onEvent, onPlayStart, heading = "Song of the Day", trackPlay = true }) {
  const { t } = useLang();
  const mountRef = useRef(null);
  const playerRef = useRef(null);
  const closeRef = useRef(null);
  const playedOnce = useRef(false);
  const tapTimer = useRef(null);
  const [state, setState] = useState(parsed.kind === "youtube" ? "loading" : "ready"); // loading|ready|playing|paused|ended|error
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [needsTap, setNeedsTap] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const shareTimer = useRef(null);
  const link = openUrl(song.link, parsed);
  useEffect(() => () => { if (shareTimer.current) clearTimeout(shareTimer.current); }, []);

  // Shares the song's own link (YouTube / Spotify) so the friend can press play right away;
  // the text mentions The Van. Without a native share sheet the link is copied instead.
  async function handleShare() {
    const name = [song.title, song.artist].filter(Boolean).join(" — ");
    const r = await shareLink({
      title: name || "Song of the Day",
      text: `🎵 ${name}\n${t("content.song.shareText")}`,
      url: link,
    });
    if ((r === "shared" || r === "copied") && onEvent) onEvent("share", { type: "song", method: r });
    if (r === "copied") {
      setShareCopied(true);
      if (shareTimer.current) clearTimeout(shareTimer.current);
      shareTimer.current = setTimeout(() => setShareCopied(false), 2200);
    }
  }

  // lock page scroll, close on Escape, restore focus
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevFocus = document.activeElement;
    document.body.style.overflow = "hidden";
    try {
      if (!document.getElementById("sp-fonts")) {
        const l = document.createElement("link");
        l.id = "sp-fonts"; l.rel = "stylesheet";
        l.href = "https://fonts.googleapis.com/css2?family=Caveat:wght@700&display=swap";
        document.head.appendChild(l);
      }
    } catch (e) { /* the player works with system fonts */ }
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    try { if (closeRef.current) closeRef.current.focus(); } catch (e) { /* ignore */ }
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch (e) { /* ignore */ }
    };
  }, [onClose]);

  // YouTube player
  useEffect(() => {
    if (parsed.kind !== "youtube") return undefined;
    let cancelled = false;
    loadYouTubeApi().then((YT) => {
      if (cancelled || !mountRef.current) return;
      const holder = document.createElement("div");
      mountRef.current.appendChild(holder);
      playerRef.current = new YT.Player(holder, {
        host: "https://www.youtube-nocookie.com",
        videoId: parsed.id,
        width: "100%", height: "100%",
        playerVars: { controls: 0, playsinline: 1, rel: 0, modestbranding: 1, iv_load_policy: 3, fs: 0, disablekb: 1, origin: window.location.origin },
        events: {
          onReady: (e) => { if (cancelled) return; setState("ready"); try { setDur(e.target.getDuration() || 0); } catch (er) { /* ignore */ } },
          onStateChange: (e) => {
            if (cancelled) return;
            const S = window.YT.PlayerState;
            if (e.data === S.PLAYING) { clearTimeout(tapTimer.current); setNeedsTap(false); setState("playing"); try { setDur(e.target.getDuration() || 0); } catch (er) { /* ignore */ } }
            else if (e.data === S.PAUSED) setState("paused");
            else if (e.data === S.ENDED) { setState("ended"); setCur(0); }
          },
          onError: () => { if (!cancelled) setState("error"); },
        },
      });
    }).catch(() => { if (!cancelled) setState("error"); });
    return () => {
      cancelled = true;
      clearTimeout(tapTimer.current);
      try { if (playerRef.current && playerRef.current.destroy) playerRef.current.destroy(); } catch (e) { /* ignore */ }
      playerRef.current = null;
    };
  }, [parsed.kind, parsed.id]);

  // progress while playing
  useEffect(() => {
    if (state !== "playing") return undefined;
    const id = setInterval(() => {
      try { const p = playerRef.current; if (p) { setCur(p.getCurrentTime() || 0); const d = p.getDuration() || 0; if (d) setDur(d); } } catch (e) { /* ignore */ }
    }, 400);
    return () => clearInterval(id);
  }, [state]);

  const toggle = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    try {
      if (state === "playing") { p.pauseVideo(); return; }
      if (onPlayStart) onPlayStart();
      if (!playedOnce.current) { playedOnce.current = true; if (trackPlay && onEvent) onEvent("song_of_day_play", { id: song.id }); }
      p.playVideo();
      // Some phones only start playback from a tap on the video itself: if nothing started, let that tap through.
      clearTimeout(tapTimer.current);
      tapTimer.current = setTimeout(() => setNeedsTap(true), 2500);
    } catch (e) { setState("error"); }
  }, [state, onPlayStart, onEvent, song.id]);

  const seek = (e) => {
    const v = Number(e.target.value);
    setCur(v);
    try { if (playerRef.current) playerRef.current.seekTo(v, true); } catch (er) { /* ignore */ }
  };

  const skip = (delta) => {
    try {
      const p = playerRef.current; if (!p) return;
      const d = p.getDuration() || dur || 0;
      const v = Math.max(0, Math.min(d || 1e9, (p.getCurrentTime() || 0) + delta));
      p.seekTo(v, true); setCur(v);
    } catch (e) { /* ignore */ }
  };
  const pct = dur ? Math.min(100, Math.max(0, (cur / dur) * 100)) : 0;
  const isYt = parsed.kind === "youtube";
  const playing = state === "playing";
  return createPortal(
    <div className="sp-backdrop" role="dialog" aria-modal="true" aria-label={t("content.song.kicker")}
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}>
      <div className="sp-sheet">
        <div className="sp-top">
          <div className="sp-head"><StarIcon /><span className="sp-head-text">{heading}</span></div>
          <button type="button" className="sp-close" onClick={onClose} ref={closeRef} aria-label={t("content.song.close")}>×</button>
        </div>

        {isYt && state !== "error" && (
          <div className={`sp-cover ${needsTap ? "sp-cover-tap" : ""}`}>
            <div ref={mountRef} className="sp-yt" />
            {state === "loading" && <div className="sp-loading">…</div>}
          </div>
        )}
        {parsed.kind === "spotify" && (
          <div className="sp-spotify">
            <iframe title={song.title} src={`https://open.spotify.com/embed/${parsed.type}/${parsed.id}?utm_source=generator&theme=0`}
              width="100%" height="152" frameBorder="0" loading="lazy"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" />
          </div>
        )}

        <div className="sp-title">{song.title}</div>
        {song.artist && <div className="sp-artist">{song.artist}</div>}

        {isYt && state !== "error" && (
          <>
            <div className="sp-progress">
              <span className="sp-time">{fmt(cur)}</span>
              <input type="range" className="sp-range" style={{ "--pct": pct + "%" }} min="0" max={dur || 1} step="1" value={Math.min(cur, dur || 1)} onChange={seek} disabled={!dur} aria-label={t("content.song.seek")} />
              <span className="sp-time">{fmt(dur)}</span>
            </div>
            <div className="sp-controls">
              <button type="button" className="sp-skip" onClick={() => skip(-15)} disabled={state === "loading"} aria-label={t("content.song.back15")}><SkipIcon dir={-1} /></button>
              <button type="button" className="sp-play" onClick={toggle} disabled={state === "loading"} aria-label={playing ? t("content.song.pause") : t("content.song.play")}>
                {playing ? (
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                ) : (
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
                )}
              </button>
              <button type="button" className="sp-skip" onClick={() => skip(15)} disabled={state === "loading"} aria-label={t("content.song.fwd15")}><SkipIcon dir={1} /></button>
            </div>
            {needsTap && !playing && <p className="sp-hint" role="status">{t("content.song.tapHint")}</p>}
          </>
        )}
        {isYt && state === "error" && <p className="sp-hint" role="alert">{t("content.song.error")}</p>}
        {parsed.kind === "spotify" && <p className="sp-hint">{t("content.song.spotifyNote")}</p>}

        <div className="sp-actions">
          {onSave && (
            <button type="button" className={`sp-save ${saved ? "sp-save-on" : ""}`} onClick={onSave} aria-pressed={saved}>
              <HeartIcon filled={saved} /> <span>{saved ? t("content.song.saved") : t("content.song.save")}</span>
            </button>
          )}
          <button type="button" className="sp-share" onClick={handleShare}>
            <ShareIcon /> <span>{shareCopied ? t("share.copied") : t("content.song.share")}</span>
          </button>
        </div>
        <a className="sp-open" href={link} target="_blank" rel="noopener noreferrer">
          {parsed.kind === "spotify" ? t("content.song.openSpotify") : t("content.song.openYoutube")} <span aria-hidden="true">↗</span>
        </a>
      </div>
    </div>,
    document.body
  );
}

export const SONGPLAYER_CSS = `
.sp-backdrop {
  position: fixed; inset: 0; z-index: 2000; display: flex; justify-content: center; align-items: flex-start;
  background: rgba(3,8,12,0.74); -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px);
}
.sp-sheet {
  position: relative; width: 100%; max-width: 460px; box-sizing: border-box; max-height: 100dvh; overflow-y: auto; overflow-x: hidden;
  padding: calc(18px + env(safe-area-inset-top, 0px)) 20px 24px;
  border-radius: 0 0 26px 26px; border: 1px solid rgba(46,208,242,0.45); border-top: none;
  animation: sp-drop 0.28s ease-out;
  background: radial-gradient(120% 60% at 80% 0%, rgba(46,208,242,0.14) 0%, rgba(46,208,242,0) 60%), linear-gradient(170deg, #0d2a37 0%, #08171f 70%);
  box-shadow: inset 0 0 0 1px rgba(46,208,242,0.12), 0 10px 40px rgba(0,0,0,0.5);
  color: #fff; display: flex; flex-direction: column; align-items: stretch; text-align: center; font-family: 'Inter', -apple-system, sans-serif;
}
@keyframes sp-drop { from { transform: translateY(-24px); opacity: 0; } to { transform: none; opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .sp-sheet { animation: none; } }
.sp-top { position: relative; display: flex; align-items: center; justify-content: center; min-height: 46px; margin: 0 0 14px; padding: 0 46px; }
.sp-head { display: inline-flex; align-items: center; gap: clamp(6px, 2.4vw, 12px); max-width: 100%; }
.sp-star { flex: none; width: clamp(26px, 8.5vw, 40px); height: auto; transform: rotate(-8deg); filter: drop-shadow(0 2px 4px rgba(0,0,0,0.35)); }
.sp-head-text {
  position: relative; font-family: 'Caveat', 'Dancing Script', cursive; font-size: clamp(24px, 7.4vw, 34px); font-weight: 700; line-height: 1.1;
  color: #fff; padding-bottom: 7px; white-space: nowrap;
}
.sp-head-text::after {
  content: ""; position: absolute; left: -2px; right: -2px; bottom: 0; height: 7px;
  background: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 10' preserveAspectRatio='none'><path d='M3 6 C 50 2, 100 8, 160 4 S 250 6, 297 3' fill='none' stroke='%23ffd23f' stroke-width='4' stroke-linecap='round'/></svg>") center / 100% 100% no-repeat;
}
.sp-close {
  position: absolute; right: -6px; top: -6px; width: 34px; height: 34px; border-radius: 50%; border: 1px solid rgba(57,172,208,0.5);
  background: rgba(10,13,11,0.45); color: #fff; font-size: 21px; line-height: 1; cursor: pointer;
}
.sp-cover {
  position: relative; width: 100%; aspect-ratio: 16 / 9; border-radius: 22px; overflow: hidden; background: #02080c;
  border: 2px solid rgba(255,255,255,0.88); box-shadow: 0 8px 26px rgba(0,0,0,0.45), 0 0 0 4px rgba(46,208,242,0.10);
}
.sp-yt, .sp-yt iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
.sp-yt iframe { pointer-events: none; }
.sp-cover-tap .sp-yt iframe { pointer-events: auto; }
.sp-loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--accent); font-size: 26px; }
.sp-spotify { border-radius: 16px; overflow: hidden; }
.sp-spotify iframe { display: block; border-radius: 16px; }
.sp-title {
  margin-top: 20px; font-family: 'Poppins', sans-serif; font-size: clamp(20px, 6.2vw, 25px); font-weight: 700;
  line-height: 1.25; color: #fff; overflow-wrap: anywhere;
}
.sp-artist { margin-top: 6px; font-size: 15px; font-weight: 500; color: #fff; overflow-wrap: anywhere; }
.sp-progress { display: flex; align-items: center; gap: 10px; margin-top: 18px; }
.sp-time { min-width: 44px; font-size: 14px; color: var(--accent); font-variant-numeric: tabular-nums; }
.sp-range {
  --pct: 0%; flex: 1; min-width: 0; height: 28px; margin: 0; background: transparent; cursor: pointer;
  -webkit-appearance: none; appearance: none;
}
.sp-range::-webkit-slider-runnable-track { height: 4px; border-radius: 4px; background: linear-gradient(to right, #ffd23f var(--pct), rgba(57,172,208,0.75) var(--pct)); }
.sp-range::-moz-range-track { height: 4px; border-radius: 4px; background: rgba(57,172,208,0.75); }
.sp-range::-moz-range-progress { height: 4px; border-radius: 4px; background: #ffd23f; }
.sp-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 20px; height: 20px; margin-top: -8px; border-radius: 50%; background: #ffd23f; border: none; box-shadow: 0 1px 5px rgba(0,0,0,0.5); }
.sp-range::-moz-range-thumb { width: 20px; height: 20px; border-radius: 50%; background: #ffd23f; border: none; box-shadow: 0 1px 5px rgba(0,0,0,0.5); }
.sp-range:disabled { opacity: 0.6; cursor: default; }
.sp-controls { display: flex; justify-content: center; align-items: center; gap: 34px; margin-top: 10px; }
.sp-play {
  width: 70px; height: 70px; border-radius: 50%; border: 3px solid #fff; background: transparent; color: #fff;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
}
.sp-skip { width: 48px; height: 48px; border: none; background: transparent; color: rgba(255,255,255,0.78); display: flex; align-items: center; justify-content: center; cursor: pointer; }
.sp-play:disabled, .sp-skip:disabled { opacity: 0.45; cursor: default; }
.sp-hint { margin: 12px 0 0; font-size: 12.5px; line-height: 1.45; color: rgba(255,255,255,0.72); }
.sp-actions { margin-top: 18px; display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; max-width: 100%; }
.sp-save, .sp-share {
  margin: 0; width: auto; max-width: 100%; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 8px 16px; border-radius: 999px; border: 1px solid rgba(255,210,63,0.5); background: transparent; color: rgba(255,255,255,0.85); cursor: pointer;
  font-family: 'Poppins', sans-serif; font-size: 13.5px; font-weight: 600; line-height: 1.25; text-align: left;
}
.sp-heart, .sp-shareicon { flex: none; color: #ffd23f; }
.sp-save-on { border-color: rgba(255,210,63,0.85); background: rgba(255,210,63,0.1); color: #fff; }
.sp-share { border-color: rgba(255,255,255,0.28); }
.sp-open { margin-top: 14px; font-size: 12.5px; font-weight: 600; color: rgba(255,255,255,0.6); text-decoration: none; }
`;
