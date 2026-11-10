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
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}

function openUrl(link, parsed) {
  if (parsed && parsed.kind === "youtube") return `https://www.youtube.com/watch?v=${parsed.id}`;
  return link;
}

function HeartIcon({ filled }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" />
    </svg>
  );
}

export function SongPlayerSheet({ song, parsed, saved, onSave, onClose, onEvent, onPlayStart }) {
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
  const link = openUrl(song.link, parsed);

  // lock page scroll, close on Escape, restore focus
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevFocus = document.activeElement;
    document.body.style.overflow = "hidden";
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
      if (!playedOnce.current) { playedOnce.current = true; if (onEvent) onEvent("song_of_day_play", { id: song.id }); }
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

  const isYt = parsed.kind === "youtube";
  const playing = state === "playing";
  return createPortal(
    <div className="sp-backdrop" role="dialog" aria-modal="true" aria-label={t("content.song.kicker")}
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}>
      <div className="sp-sheet">
        <div className="sp-top">
          <span className="sp-kicker"><span aria-hidden="true">★</span> {t("content.song.kicker")}</span>
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
              <input type="range" className="sp-range" min="0" max={dur || 1} step="1" value={Math.min(cur, dur || 1)} onChange={seek} disabled={!dur} aria-label={t("content.song.seek")} />
              <span className="sp-time">{fmt(dur)}</span>
            </div>
            <div className="sp-controls">
              <button type="button" className="sp-play" onClick={toggle} disabled={state === "loading"} aria-label={playing ? t("content.song.pause") : t("content.song.play")}>
                {playing ? (
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                ) : (
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
                )}
              </button>
            </div>
            {needsTap && !playing && <p className="sp-hint" role="status">{t("content.song.tapHint")}</p>}
          </>
        )}
        {isYt && state === "error" && <p className="sp-hint" role="alert">{t("content.song.error")}</p>}
        {parsed.kind === "spotify" && <p className="sp-hint">{t("content.song.spotifyNote")}</p>}

        <button type="button" className={`sp-save ${saved ? "sp-save-on" : ""}`} onClick={onSave} aria-pressed={saved}>
          <HeartIcon filled={saved} /> {saved ? t("content.song.saved") : t("content.song.save")}
        </button>
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
  position: fixed; inset: 0; z-index: 70; display: flex; justify-content: center; align-items: flex-end;
  background: rgba(3,8,12,0.72); -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px);
}
.sp-sheet {
  width: 100%; max-width: 460px; box-sizing: border-box; max-height: 100dvh; overflow-y: auto;
  padding: 16px 18px calc(22px + env(safe-area-inset-bottom, 0px));
  border-radius: 24px 24px 0 0; border: 1px solid rgba(46,208,242,0.38); border-bottom: none;
  background: linear-gradient(160deg, #0c2430 0%, #08171f 75%); color: var(--text);
  display: flex; flex-direction: column; align-items: stretch; text-align: center;
}
.sp-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.sp-kicker { font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #ffd23f; }
.sp-close {
  width: 36px; height: 36px; border-radius: 50%; border: 1px solid rgba(57,172,208,0.5); background: rgba(10,13,11,0.5);
  color: var(--text); font-size: 22px; line-height: 1; cursor: pointer;
}
.sp-cover { position: relative; width: 100%; aspect-ratio: 16 / 9; border-radius: 16px; overflow: hidden; background: #02080c; border: 1px solid rgba(255,255,255,0.14); }
.sp-yt, .sp-yt iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
.sp-yt iframe { pointer-events: none; }
.sp-cover-tap .sp-yt iframe { pointer-events: auto; }
.sp-loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--accent); font-size: 26px; }
.sp-spotify { border-radius: 14px; overflow: hidden; }
.sp-spotify iframe { display: block; border-radius: 14px; }
.sp-title { margin-top: 16px; font-family: 'Poppins', sans-serif; font-size: 20px; font-weight: 700; line-height: 1.25; overflow-wrap: anywhere; }
.sp-artist { margin-top: 2px; font-size: 14.5px; font-weight: 600; color: var(--accent); overflow-wrap: anywhere; }
.sp-progress { display: flex; align-items: center; gap: 10px; margin-top: 16px; }
.sp-time { min-width: 38px; font-size: 12.5px; color: var(--accent); font-variant-numeric: tabular-nums; }
.sp-range { flex: 1; min-width: 0; accent-color: #ffd23f; height: 28px; cursor: pointer; }
.sp-controls { display: flex; justify-content: center; margin-top: 6px; }
.sp-play {
  width: 64px; height: 64px; border-radius: 50%; border: 2px solid var(--text); background: transparent; color: var(--text);
  display: flex; align-items: center; justify-content: center; cursor: pointer;
}
.sp-play:disabled { opacity: 0.45; cursor: default; }
.sp-hint { margin: 10px 0 0; font-size: 12.5px; line-height: 1.45; color: rgba(242,241,236,0.72); }
.sp-save {
  margin-top: 16px; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 16px; border-radius: 999px;
  border: 2px solid #ffd23f; background: transparent; color: #ffd23f; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit;
}
.sp-save-on { background: rgba(255,210,63,0.14); }
.sp-open { margin-top: 12px; font-size: 12.5px; font-weight: 700; color: var(--accent); text-decoration: none; }
`;
