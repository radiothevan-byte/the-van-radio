// THE VAN — Content Engine front end: "Song of the Day" and "The Van Poll" (nothing else).
// Independent from the Promotion Engine. Data comes ONLY from the Apps Script endpoint
// `?action=content`, which already filters to Status = "Published"; the client trusts nothing
// beyond that: every field is re-validated, links must be https, and a failure or an empty
// answer simply renders nothing (Home stays exactly as it was).
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLang } from "./i18n.jsx";
import { SongPlayerSheet, parseSongLink, SONGPLAYER_CSS } from "./songplayer.jsx";

const CACHE_KEY = "tvr_content_cache_v1";
const CACHE_FRESH_MS = 5 * 60 * 1000;
const CACHE_STALE_OK_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const TOKEN_KEY = "tvr_vote_token";
const voteKey = (pollId) => `tvr_poll_vote_${pollId}`;

function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* ignore */ } }

const str = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
const httpsOnly = (v) => (/^https:\/\//i.test(str(v, 500)) ? str(v, 500) : "");

export function normalizeSong(s) {
  if (!s || typeof s !== "object") return null;
  const title = str(s.title, 140);
  if (!title) return null;
  return {
    id: str(s.id, 80), title, artist: str(s.artist, 140), link: httpsOnly(s.link),
    noteEl: str(s.noteEl, 400), noteEn: str(s.noteEn, 400),
  };
}

export function normalizePoll(p) {
  if (!p || typeof p !== "object" || !p.id || !Array.isArray(p.options)) return null;
  const options = p.options
    .map((o, i) => ({ index: Number.isInteger(o && o.index) ? o.index : i, el: str(o && o.el, 80), en: str(o && o.en, 80) }))
    .filter((o) => (o.el || o.en) && o.index >= 0 && o.index <= 3)
    .slice(0, 4);
  if (options.length < 2) return null;
  const questionEl = str(p.questionEl, 200), questionEn = str(p.questionEn, 200);
  if (!questionEl && !questionEn) return null;
  const votes = options.map((o, i) => {
    const n = Array.isArray(p.votes) ? Number(p.votes[o.index]) : 0;
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  });
  return { id: str(p.id, 80), questionEl, questionEn, options, votes };
}

function readCache() {
  try { const c = JSON.parse(lsGet(CACHE_KEY) || "null"); return c && c.t && c.data ? c : null; } catch (e) { return null; }
}

export async function fetchContent(webhookUrl) {
  if (!webhookUrl || webhookUrl.includes("PASTE_")) return { song: null, poll: null };
  const cached = readCache();
  if (cached && Date.now() - cached.t < CACHE_FRESH_MS) return { song: normalizeSong(cached.data.song), poll: normalizePoll(cached.data.poll) };
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS) : null;
  try {
    const res = await fetch(`${webhookUrl}?action=content`, ctrl ? { signal: ctrl.signal } : undefined);
    if (!res.ok) throw new Error("content HTTP " + res.status);
    const data = await res.json();
    if (!data || data.ok !== true || !data.content) throw new Error("content malformed");
    lsSet(CACHE_KEY, JSON.stringify({ t: Date.now(), data: data.content }));
    return { song: normalizeSong(data.content.song), poll: normalizePoll(data.content.poll) };
  } catch (e) {
    if (cached && Date.now() - cached.t < CACHE_STALE_OK_MS) return { song: normalizeSong(cached.data.song), poll: normalizePoll(cached.data.poll) };
    return { song: null, poll: null };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function voteToken() {
  let t = lsGet(TOKEN_KEY);
  if (t && /^[A-Za-z0-9_-]{8,64}$/.test(t)) return t;
  try {
    const a = new Uint8Array(12);
    window.crypto.getRandomValues(a);
    t = Array.from(a, (b) => b.toString(36).padStart(2, "0")).join("");
  } catch (e) {
    t = Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
  lsSet(TOKEN_KEY, t);
  return t;
}

const ContentContext = createContext({ song: null, poll: null, webhookUrl: "", onEvent: null, myVanSongs: [], onSaveSong: null, onSongPlay: null });

// `onEvent(name, props)` is optional (analytics hook, wired up by the app); it is never required.
export function ContentProvider({ webhookUrl, onEvent, myVanSongs, onSaveSong, onSongPlay, children }) {
  const [state, setState] = useState({ song: null, poll: null });
  useEffect(() => {
    let cancelled = false;
    fetchContent(webhookUrl).then((c) => { if (!cancelled) setState(c); }).catch(() => {});
    return () => { cancelled = true; };
  }, [webhookUrl]);
  const value = useMemo(() => ({ ...state, webhookUrl, onEvent: onEvent || null, myVanSongs: myVanSongs || [], onSaveSong: onSaveSong || null, onSongPlay: onSongPlay || null }), [state, webhookUrl, onEvent, myVanSongs, onSaveSong, onSongPlay]);
  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}

export function youtubeSearchUrl(song) {
  return "https://www.youtube.com/results?search_query=" + encodeURIComponent(`${song.title} ${song.artist}`.trim());
}

// A "play" control for any saved / Atlas song: opens the same in-app player as the Song of the Day.
// Links that cannot be played inside the app (not YouTube / Spotify) keep opening in a new tab, as before.
// Renders `children` as the label; `className` lets the caller keep its own look.
export function SongPlayLink({ song, className, children, heading, saved, onSave, ariaLabel, fallbackHref }) {
  const { onEvent, onSongPlay } = useContext(ContentContext);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const parsed = parseSongLink(song && song.link);
  const href = (song && song.link) || fallbackHref || "";
  if (!parsed) {
    return href ? <a className={className} href={href} target="_blank" rel="noreferrer" aria-label={ariaLabel}>{children}</a> : null;
  }
  return (
    <>
      <button type="button" className={className} onClick={(e) => { e.stopPropagation(); setOpen(true); }} aria-label={ariaLabel}>{children}</button>
      {open && (
        <SongPlayerSheet song={song} parsed={parsed} saved={!!saved} onSave={onSave} onClose={close} onEvent={onEvent} onPlayStart={onSongPlay}
          heading={heading} trackPlay={false} />
      )}
    </>
  );
}

export function SongOfTheDayCard() {
  const { song, onEvent, myVanSongs, onSaveSong, onSongPlay } = useContext(ContentContext);
  const { lang, t } = useLang();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  if (!song) return null;
  const note = (lang === "en" ? song.noteEn || song.noteEl : song.noteEl || song.noteEn) || "";
  const parsed = parseSongLink(song.link);
  const href = song.link || youtubeSearchUrl(song);
  const songKey = `sotd:${song.id || song.title}`;
  const saved = (myVanSongs || []).some((x) => x.id === songKey);
  const openPlayer = () => { setOpen(true); if (onEvent) onEvent("song_of_day_click", { id: song.id }); };
  return (
    <section className={`content-card content-song ${parsed ? "content-song-playable" : ""}`} aria-label={t("content.song.kicker")}
      onClick={parsed ? openPlayer : undefined}>
      <span className="content-kicker">♪ {t("content.song.kicker")}</span>
      <div className="content-title">{song.title}</div>
      {song.artist && <div className="content-artist">{song.artist}</div>}
      {note && <p className="content-note">{note}</p>}
      {parsed ? (
        <button type="button" className="content-cta content-cta-btn" onClick={(e) => { e.stopPropagation(); openPlayer(); }}>
          <span aria-hidden="true">▶</span> {t("content.song.play")}
        </button>
      ) : (
        <a className="content-cta" href={href} target="_blank" rel="noopener noreferrer" onClick={() => onEvent && onEvent("song_of_day_click", { id: song.id })}>
          {t("content.song.listen")} <span aria-hidden="true">→</span>
        </a>
      )}
      {open && parsed && (
        <SongPlayerSheet song={song} parsed={parsed} saved={saved} onClose={close} onEvent={onEvent} onPlayStart={onSongPlay}
          onSave={() => { if (onSaveSong) onSaveSong({ id: songKey, title: song.title, artist: song.artist, musicUrl: song.link, placeName: "" }); }} />
      )}
    </section>
  );
}

export function VanPollCard() {
  const { poll, webhookUrl, onEvent } = useContext(ContentContext);
  const { lang, t } = useLang();
  const [voted, setVoted] = useState(null);       // option index this browser voted for
  const [votes, setVotes] = useState(null);       // counts, once known
  const [busy, setBusy] = useState(false);
  const pollId = poll && poll.id;
  useEffect(() => {
    if (!poll) return;
    const v = lsGet(voteKey(poll.id));
    setVoted(v !== null && /^[0-3]$/.test(v) ? parseInt(v, 10) : null);
    setVotes(poll.votes);
  }, [pollId]); // eslint-disable-line react-hooks/exhaustive-deps
  const vote = useCallback(async (optionIndex) => {
    if (!poll || voted !== null || busy) return;
    setBusy(true);
    setVoted(optionIndex);
    lsSet(voteKey(poll.id), String(optionIndex));
    setVotes((prev) => (prev || poll.votes).map((n, i) => (poll.options[i] && poll.options[i].index === optionIndex ? n + 1 : n)));
    if (onEvent) onEvent("poll_vote", { id: poll.id });
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ form_type: "poll_vote", poll_id: poll.id, option: optionIndex, token: voteToken() }),
      });
      const data = await res.json();
      if (data && data.ok && Array.isArray(data.votes)) setVotes(data.votes.map((n) => (Number.isFinite(Number(n)) ? Number(n) : 0)));
    } catch (e) { /* keep the optimistic result; the vote is best-effort for a casual poll */ }
    setBusy(false);
  }, [poll, voted, busy, webhookUrl, onEvent]);
  if (!poll) return null;
  const q = (lang === "en" ? poll.questionEn || poll.questionEl : poll.questionEl || poll.questionEn);
  const counts = votes || poll.votes;
  const total = counts.reduce((a, b) => a + b, 0);
  const showResults = voted !== null;
  return (
    <section className="content-card content-poll" aria-label={t("content.poll.kicker")}>
      <span className="content-kicker">{t("content.poll.kicker")}</span>
      <div className="content-title">{q}</div>
      <div className="poll-options">
        {poll.options.map((o, i) => {
          const label = lang === "en" ? o.en || o.el : o.el || o.en;
          const pct = total ? Math.round((counts[i] / total) * 100) : 0;
          return showResults ? (
            <div key={o.index} className={`poll-result ${voted === o.index ? "poll-result-mine" : ""}`}>
              <span className="poll-result-bar" style={{ width: `${pct}%` }} />
              <span className="poll-result-label">{label}</span>
              <span className="poll-result-pct">{pct}%</span>
            </div>
          ) : (
            <button key={o.index} type="button" className="poll-option" onClick={() => vote(o.index)}>{label}</button>
          );
        })}
      </div>
      {showResults && <div className="poll-foot">{t("content.poll.thanks")} · {t("content.poll.votes", { n: total })}</div>}
    </section>
  );
}

export const CONTENT_CSS = SONGPLAYER_CSS + `
button.myvan-song-link, button.atlas-entry-link { background: none; border: 0; padding: 0; margin: 0; cursor: pointer; font-family: inherit; text-align: inherit; }
button.myvan-song-link { padding: 4px 6px; }
/* ---- Content Engine: Song of the Day + Van Poll ---- */
.content-card {
  position: relative; display: flex; flex-direction: column; gap: 4px; margin: 0 0 14px;
  padding: 14px 16px; box-sizing: border-box; border-radius: 18px;
  border: 1px solid rgba(46,208,242,0.38); background: linear-gradient(135deg, #0c2430 0%, #08171f 70%);
  color: var(--text);
}
.content-kicker {
  align-self: flex-start; margin-bottom: 6px;
  font-size: 10.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--accent); background: rgba(10,13,11,0.62); border: 1px solid rgba(57,172,208,0.45);
  border-radius: 999px; padding: 4px 9px;
}
.content-title { font-family: 'Poppins', sans-serif; font-size: 17px; font-weight: 700; line-height: 1.25; }
.content-artist { font-size: 13.5px; color: var(--accent); font-weight: 600; }
.content-note { margin: 4px 0 0; font-size: 13px; line-height: 1.45; color: rgba(242,241,236,0.82); }
.content-song-playable { cursor: pointer; }
.content-cta-btn { background: none; border: none; padding: 0; cursor: pointer; font-family: inherit; }
.content-cta { margin-top: 8px; align-self: flex-start; font-size: 12.5px; font-weight: 700; color: var(--accent); text-decoration: none; }
.poll-options { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.poll-option {
  width: 100%; text-align: left; padding: 11px 14px; border-radius: 12px; font-family: inherit; font-size: 14px; font-weight: 600;
  background: rgba(10,13,11,0.55); border: 1px solid rgba(57,172,208,0.45); color: var(--text); cursor: pointer;
}
.poll-option:hover { background: var(--surface-2); }
.poll-result {
  position: relative; display: flex; justify-content: space-between; gap: 10px; align-items: center; overflow: hidden;
  padding: 11px 14px; border-radius: 12px; border: 1px solid var(--border); background: rgba(10,13,11,0.55); font-size: 14px;
}
.poll-result-bar { position: absolute; inset: 0 auto 0 0; background: rgba(57,172,208,0.22); transition: width .4s ease; }
.poll-result-mine { border-color: rgba(57,172,208,0.7); }
.poll-result-mine .poll-result-label { font-weight: 700; }
.poll-result-label, .poll-result-pct { position: relative; }
.poll-result-pct { font-weight: 700; color: var(--accent); }
.poll-foot { margin-top: 8px; font-size: 12px; color: var(--text-dim); }
`;
