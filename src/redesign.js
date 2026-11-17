// THE VAN — visual design system ("midnight teal").
// Presentation only: this layer is injected AFTER every other stylesheet, redefines the colour tokens the
// app already uses (so every screen shifts together) and then refines the shared component families
// (cards, buttons, fields, navigation, map frame, sheets). No markup, behaviour, data or asset is changed here.
//
// Tokens
//   colours   --bg --surface --surface-2 --border --accent --accent-dim --text --text-dim --text-dim2
//   rd-*      radius, spacing, shadows, glow, transitions and focus ring used by the rules below
export const REDESIGN_CSS = `
:root {
  --bg: #07191D;
  --surface: #10272C;
  --surface-2: #17343A;
  --border: rgba(54, 196, 217, 0.20);
  --accent: #36C4D9;
  --accent-dim: #2A98AB;
  --text: #F5F7F6;
  --text-dim: #A5B7B8;
  --text-dim2: #7A9599;

  --rd-deep: #061418;
  --rd-line: rgba(54, 196, 217, 0.30);
  --rd-line-strong: rgba(54, 196, 217, 0.55);
  --rd-glass: rgba(7, 25, 29, 0.62);
  --rd-card-bg: linear-gradient(160deg, rgba(28, 62, 69, 0.82) 0%, rgba(14, 37, 42, 0.94) 100%);
  --rd-card-bg-flat: linear-gradient(160deg, rgba(23, 52, 58, 0.7) 0%, rgba(12, 32, 37, 0.9) 100%);
  --rd-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 14px 30px -16px rgba(0, 0, 0, 0.8), 0 0 24px -12px rgba(54, 196, 217, 0.4);
  --rd-glow: 0 0 0 1px rgba(54, 196, 217, 0.14), 0 0 26px -8px rgba(54, 196, 217, 0.55);
  --rd-btn-bg: linear-gradient(135deg, #4fd8ea 0%, #2aa6bb 100%);
  --rd-btn-shadow: 0 10px 24px -8px rgba(54, 196, 217, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.35);
  --rd-r-sm: 12px;
  --rd-r: 18px;
  --rd-r-lg: 24px;
  --rd-ease: cubic-bezier(0.2, 0.7, 0.2, 1);
  --rd-t: 0.2s;
  --rd-gap: 12px;
  --tabbar-h: calc(68px + env(safe-area-inset-bottom, 0px));
}

html, body { background: var(--rd-deep); }
body { -webkit-font-smoothing: antialiased; }

.app-root {
  background:
    radial-gradient(130% 42% at 50% -6%, #0f3b45 0%, rgba(15, 59, 69, 0) 62%),
    radial-gradient(90% 38% at 100% 100%, rgba(54, 196, 217, 0.09) 0%, rgba(54, 196, 217, 0) 60%),
    linear-gradient(180deg, var(--bg) 0%, var(--rd-deep) 100%);
  box-shadow: 0 0 0 1px rgba(54, 196, 217, 0.06);
}

/* ---- atmosphere: the real hero photograph, softly lit, behind the top of every inner screen ---- */
.rd-atmo { position: absolute; top: 0; left: 0; right: 0; height: 250px; overflow: hidden; pointer-events: none; z-index: 0;
  -webkit-mask-image: linear-gradient(180deg, #000 0%, rgba(0, 0, 0, 0.6) 55%, transparent 100%);
  mask-image: linear-gradient(180deg, #000 0%, rgba(0, 0, 0, 0.6) 55%, transparent 100%); }
.rd-atmo img { width: 100%; height: 100%; object-fit: cover; object-position: 62% 70%; display: block; opacity: 0.5; filter: saturate(0.9) brightness(0.8); }
.rd-atmo::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(7, 25, 29, 0.35) 0%, rgba(7, 25, 29, 0.55) 60%, var(--bg) 100%); }
.screen { position: relative; }
.top-action-bar { z-index: 15; }

/* ---- typography ---- */
.eyebrow { color: var(--accent); font-weight: 700; letter-spacing: 0.18em; font-size: 11.5px; text-shadow: 0 0 14px rgba(54, 196, 217, 0.35); }
.page-title { letter-spacing: -0.015em; text-shadow: 0 2px 18px rgba(0, 0, 0, 0.45); }
.section-title { letter-spacing: 0.01em; }
.route-intro-text, .about-text, .roadbook-p { color: var(--text-dim); }

/* ---- card family ---- */
.hub-card, .content-card, .promo-card, .hero-card, .ep-row, .route-form-card, .pc-section, .about-card, .connect-row,
.myvan-song-row, .myvan-postcard-card, .roadbook-slide, .route-row, .route-arrived-card, .route-preview-card,
.atlas-view-toggle, .chat-join-card, .roadbook-choice-card, .community-prompts .community-row {
  border-color: var(--rd-line);
}
.hub-card, .content-card, .promo-card, .hero-card, .route-form-card, .pc-section, .about-card, .myvan-song-row,
.myvan-postcard-card, .roadbook-slide, .route-arrived-card, .route-preview-card {
  box-shadow: var(--rd-shadow);
}
.route-form-card, .pc-section:not(.pc-section-optional), .about-card, .connect-row, .myvan-song-row, .myvan-postcard-card,
.roadbook-slide, .route-arrived-card, .route-preview-card, .roadbook-choice-card {
  background: var(--rd-card-bg);
}
.content-card { background: linear-gradient(135deg, #0d3038 0%, #08202a 70%); border-radius: var(--rd-r-lg); }
.promo-card:not(.promo-has-img) { background-image: linear-gradient(135deg, #0d3038 0%, #08202a 70%); }
.pc-section-optional { background: transparent; border-color: var(--rd-line); }

/* ---- buttons ---- */
.pill-btn, .chat-send-btn, .myvan-tab-active, .play-btn-lg, .play-btn-sm, .play-btn-mini, .ep-row-active .play-btn-sm {
  background: var(--rd-btn-bg); color: #04252b; border-color: transparent;
}
.pill-btn { box-shadow: var(--rd-btn-shadow); transition: transform var(--rd-t) var(--rd-ease), filter var(--rd-t); }
.pill-btn:hover:not(:disabled) { filter: brightness(1.06); }
.pill-btn:active:not(:disabled) { transform: scale(0.98); }
.pill-btn:disabled { box-shadow: none; filter: saturate(0.5); }
.pill-btn-ghost { border-color: var(--rd-line); color: var(--text-dim); background: rgba(7, 25, 29, 0.35); }
.play-btn-lg { width: 60px; height: 60px; box-shadow: 0 0 0 6px rgba(54, 196, 217, 0.13), 0 12px 28px -6px rgba(54, 196, 217, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.4); }
.play-btn-sm { background: rgba(54, 196, 217, 0.14); color: var(--accent); box-shadow: inset 0 0 0 1px var(--rd-line); }
.ep-row-active .play-btn-sm, .play-btn-mini { background: var(--rd-btn-bg); color: #04252b; box-shadow: 0 6px 16px -6px rgba(54, 196, 217, 0.7); }
.icon-btn { transition: color var(--rd-t), background var(--rd-t); }
.icon-btn:hover { background: rgba(54, 196, 217, 0.1); }
.detail-heart { background: var(--rd-glass); border-color: var(--rd-line); }

/* ---- fields ---- */
.route-input, .route-textarea, .route-search-input, .chat-name-input, .chat-text-input {
  background: rgba(7, 25, 29, 0.6); border-color: var(--rd-line); color: var(--text);
  transition: border-color var(--rd-t), box-shadow var(--rd-t), background var(--rd-t);
}
.route-input::placeholder, .route-textarea::placeholder, .route-search-input::placeholder { color: var(--text-dim2); }
.route-input:focus, .route-textarea:focus, .route-search-input:focus, .chat-name-input:focus, .chat-text-input:focus {
  outline: none; border-color: var(--accent); background: rgba(10, 36, 42, 0.8); box-shadow: 0 0 0 3px rgba(54, 196, 217, 0.18);
}
.route-search-btn { border-color: var(--rd-line-strong); background: rgba(54, 196, 217, 0.14); }
.route-search-results { background: var(--surface); border-color: var(--rd-line); box-shadow: var(--rd-shadow); }
.route-field-label { color: var(--text-dim); letter-spacing: 0.04em; }
button:focus-visible, a:focus-visible, [role="tab"]:focus-visible, input[type="range"]:focus-visible, summary:focus-visible {
  outline: 2px solid var(--accent); outline-offset: 2px;
}
.postcard-consent input { accent-color: var(--accent); }

/* ---- top action bar (Live / Co-pilot / EL EN) ---- */
.top-action-btn { background: var(--rd-glass); border-color: var(--rd-line-strong); box-shadow: 0 0 18px -8px rgba(54, 196, 217, 0.6); }
.lang-toggle { background: var(--rd-glass); border-color: var(--rd-line-strong); }

/* ---- bottom navigation ---- */
.tab-bar {
  background: linear-gradient(180deg, rgba(9, 38, 45, 0.94) 0%, rgba(5, 20, 24, 0.985) 100%);
  border-top: 1px solid var(--rd-line-strong);
  box-shadow: 0 -10px 30px -10px rgba(0, 0, 0, 0.7), 0 -1px 18px -4px rgba(54, 196, 217, 0.35);
  padding-left: 8px; padding-right: 8px;
  box-sizing: border-box; min-height: var(--tabbar-h);
}
.tab-btn { position: relative; border-radius: 16px; color: var(--text-dim2); transition: color var(--rd-t); }
.tab-btn > * { position: relative; z-index: 1; }
.tab-btn::before { content: ""; position: absolute; inset: -1px 8px; border-radius: 16px; background: transparent; box-shadow: none; transition: background var(--rd-t), box-shadow var(--rd-t); }
.tab-btn.tab-active { color: var(--accent); }
.tab-btn.tab-active::before { background: rgba(54, 196, 217, 0.11); box-shadow: inset 0 0 0 1px rgba(54, 196, 217, 0.38), 0 0 18px -4px rgba(54, 196, 217, 0.55); }
.tab-btn.tab-active svg { filter: drop-shadow(0 0 6px rgba(54, 196, 217, 0.6)); }
.tab-label { letter-spacing: 0.02em; }

/* ---- mini player ---- */
.mini-player { background: rgba(6, 24, 29, 0.94); border-top: 1px solid var(--rd-line-strong); box-shadow: 0 -10px 28px -10px rgba(0, 0, 0, 0.7); }
.mini-seek { background: linear-gradient(to right, var(--accent) var(--pct), rgba(54, 196, 217, 0.18) var(--pct)); }
.mini-seek::-webkit-slider-thumb { background: #fff; box-shadow: 0 0 0 3px rgba(54, 196, 217, 0.4); }

/* ---- Home ---- */
.hub-hero-scrim {
  background:
    linear-gradient(to top, var(--bg) 0%, rgba(7, 25, 29, 0.85) 22%, rgba(7, 25, 29, 0) 58%),
    linear-gradient(to bottom, rgba(7, 25, 29, 0.6) 0%, rgba(7, 25, 29, 0) 28%);
}
.hub-hero-title::after {
  content: ""; display: block; width: min(150px, 46%); height: 9px; margin-top: 9px;
  background: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 10' preserveAspectRatio='none'><path d='M3 6 C 30 2, 60 8, 95 4 S 140 5, 157 3' fill='none' stroke='%2336C4D9' stroke-width='3.6' stroke-linecap='round'/></svg>") center / 100% 100% no-repeat;
  filter: drop-shadow(0 0 6px rgba(54, 196, 217, 0.55));
}
.hub-hero-sub { color: #8fc7d4; }
.hub-card { background-color: #0a272e; border-radius: 20px; border: 1px solid var(--rd-line); transition: transform var(--rd-t) var(--rd-ease), box-shadow var(--rd-t); }
.hub-card:hover { box-shadow: var(--rd-shadow), var(--rd-glow); }
.hub-card-title { color: #5fd9ea; text-shadow: 0 0 16px rgba(54, 196, 217, 0.3); }
.hub-card-text { color: #aec3c5; }
.hub-card-arrow { color: var(--accent); filter: drop-shadow(0 0 5px rgba(54, 196, 217, 0.6)); }
.hub-atlas-fade { background: linear-gradient(90deg, #0a272e 0%, #0a272e 24%, rgba(10, 39, 46, 0) 54%); }

/* ---- Journeys ---- */
.hero-card { border-radius: var(--rd-r-lg); border-color: var(--rd-line-strong); }
.hero-card > * { position: relative; z-index: 1; }
.hero-card::before { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; z-index: 0;
  background: linear-gradient(180deg, rgba(7, 25, 29, 0) 35%, rgba(7, 25, 29, 0.7) 100%); }
.hero-badge { background: rgba(54, 196, 217, 0.14); border-color: var(--rd-line-strong); color: #7fe3f1; }
.ep-row { background: var(--rd-card-bg-flat); border: 1px solid var(--rd-line); border-radius: var(--rd-r); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04); }
.ep-row-active { border-color: var(--rd-line-strong); box-shadow: var(--rd-glow); }
.ep-list { gap: 10px; }
.ep-title { letter-spacing: 0.005em; }
.thumb-fallback { background: linear-gradient(145deg, #17343a, #0e2a30); color: var(--accent); box-shadow: inset 0 0 0 1px var(--rd-line); }

/* journey detail */
.detail-overlay { background: var(--bg); }
.detail-hero-bg { filter: blur(35px) brightness(0.5) saturate(1.15) hue-rotate(-6deg); }
.detail-hero-fade { background: linear-gradient(180deg, rgba(7, 25, 29, 0.1) 0%, rgba(7, 25, 29, 0.12) 38%, rgba(7, 25, 29, 0.78) 70%, rgba(6, 20, 24, 0.98) 100%); }
.detail-close { background: var(--rd-glass); border-color: var(--rd-line-strong); }
.detail-title { font-family: 'Playfair Display', Georgia, serif; font-style: italic; font-weight: 600; font-size: 26px; letter-spacing: 0; text-shadow: 0 2px 16px rgba(0, 0, 0, 0.6); }
.detail-date { color: #8fc7d4; }
.detail-description { color: rgba(245, 247, 246, 0.9); }
.detail-body-bottom { border-top-left-radius: 28px; border-top-right-radius: 28px; }

/* ---- shared empty / badges ---- */
.empty-icon-circle { background: rgba(54, 196, 217, 0.12); border-color: var(--rd-line-strong); box-shadow: var(--rd-glow); }
.atlas-entry-tag, .myvan-tab { border-color: var(--rd-line); }
.myvan-tab { background: var(--rd-card-bg-flat); }
.myvan-tab.myvan-tab-active { background: var(--rd-btn-bg); color: #04252b; border-color: transparent; box-shadow: var(--rd-btn-shadow); }
.myvan-song-row, .myvan-postcard-card { border-radius: var(--rd-r); }
.myvan-song-sub, .myvan-postcard-story { color: var(--text-dim); }

/* ---- About / connect ---- */
.about-card { border-radius: var(--rd-r-lg); }
.about-logo { border-color: var(--accent); box-shadow: 0 0 0 5px rgba(54, 196, 217, 0.12), 0 10px 28px -8px rgba(54, 196, 217, 0.6); }
.connect-row { border-radius: var(--rd-r); }
.connect-row:hover { background: var(--surface-2); box-shadow: var(--rd-glow); }
.connect-icon { background: rgba(54, 196, 217, 0.14); box-shadow: inset 0 0 0 1px var(--rd-line); }

/* ---- Roadbook ---- */
.roadbook-header { background: var(--rd-card-bg); border-color: var(--rd-line-strong); box-shadow: var(--rd-shadow); }
.roadbook-icon { background: rgba(54, 196, 217, 0.14); box-shadow: inset 0 0 0 1px var(--rd-line); }
.roadbook-body { border-left-color: var(--accent); }
.route-board { background: radial-gradient(120% 100% at 30% 10%, #12383f 0%, #0a2228 70%); border-color: var(--rd-line-strong); }
.route-pin-label, .route-leaflet-pin-label, .route-map-badge { background: rgba(6, 20, 24, 0.85); border: 1px solid var(--rd-line); }
.roadbook-slide { border-radius: var(--rd-r-lg); border-color: var(--rd-line-strong); }
.roadbook-track { border-radius: var(--rd-r-lg); }
.roadbook-section-number { color: var(--accent); }
.roadbook-link-btn { background: rgba(7, 25, 29, 0.55); border-color: var(--rd-line); }
.roadbook-arrow { background: var(--rd-glass); border-color: var(--rd-line-strong); }
.roadbook-dot { background: rgba(54, 196, 217, 0.25); }
.roadbook-dot-active { background: var(--accent); box-shadow: 0 0 10px rgba(54, 196, 217, 0.7); }
.roadbook-choice-overlay { background: rgba(3, 12, 15, 0.7); -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px); }

/* ---- Pick the Route ---- */
.route-row { background: linear-gradient(180deg, rgba(54, 196, 217, 0.12), rgba(54, 196, 217, 0.04)), rgba(7, 25, 29, 0.55); border-color: var(--rd-line); border-radius: var(--rd-r-sm); color: var(--text-dim);
  transition: border-color var(--rd-t), box-shadow var(--rd-t), transform var(--rd-t); }
.route-row:hover { border-color: var(--rd-line-strong); }
.route-row-filled { border-color: var(--rd-line-strong); box-shadow: var(--rd-glow); }
.route-row-missing { border-color: #e5645a; box-shadow: 0 0 0 1px #e5645a inset; }
.route-send-btn { background: var(--rd-btn-bg); color: #04252b; box-shadow: var(--rd-btn-shadow); transition: transform var(--rd-t) var(--rd-ease), filter var(--rd-t); }
.route-send-btn:hover { filter: brightness(1.06); }
.route-sheet-backdrop { background: rgba(3, 12, 15, 0.68); }
.route-sheet { background: linear-gradient(180deg, #123037 0%, #0b2127 100%); border-color: var(--rd-line-strong); box-shadow: 0 -16px 40px -10px rgba(0, 0, 0, 0.7), 0 0 30px -10px rgba(54, 196, 217, 0.4); }
.route-sheet-grab { background: rgba(54, 196, 217, 0.4); width: 44px; }
.route-sheet-close { background: var(--rd-glass); border-color: var(--rd-line); }
.route-genre-card { background: var(--rd-card-bg-flat); border-color: var(--rd-line); }
.route-genre-active { background: rgba(54, 196, 217, 0.16); border-color: var(--accent); color: var(--accent); box-shadow: var(--rd-glow); }
.route-ticket { border-color: var(--rd-line-strong); background: linear-gradient(180deg, rgba(54, 196, 217, 0.1), var(--surface)); }
.route-confirm-line { background: rgba(54, 196, 217, 0.1); border-color: var(--rd-line-strong); }
.route-blocked-msg { color: #ff9a90; }

/* ---- Postcards from the Road ---- */
.pc-hero { border-color: var(--rd-line-strong); box-shadow: 0 14px 34px -10px rgba(0, 0, 0, 0.7), 0 0 28px -12px rgba(54, 196, 217, 0.5); border-radius: var(--rd-r-lg); }
.pc-hero::after { background: linear-gradient(180deg, rgba(7, 25, 29, 0) 50%, rgba(7, 25, 29, 0.78) 100%); }
.pc-section { border-radius: var(--rd-r); }
.pc-section:not(.pc-section-optional) > .route-field-label:first-child::before { border-color: var(--accent); background: rgba(54, 196, 217, 0.14); box-shadow: 0 0 10px -2px rgba(54, 196, 217, 0.6); }
.postcard-upload-btn { background: rgba(54, 196, 217, 0.07); border-color: var(--rd-line-strong); border-radius: var(--rd-r); transition: background var(--rd-t), border-color var(--rd-t); }
.postcard-upload-btn:hover { background: rgba(54, 196, 217, 0.13); border-color: var(--accent); }
.pc-success-card { background: var(--rd-card-bg); border-color: var(--rd-line-strong); }
.pc-stamp { background: var(--surface-2); }

/* ---- Van Atlas: toggle, map frame, markers ---- */
.atlas-view-toggle { background: var(--rd-glass); border-color: var(--rd-line-strong); box-shadow: var(--rd-shadow); padding: 5px; }
.atlas-view-toggle button { color: var(--text-dim); transition: background var(--rd-t), color var(--rd-t), box-shadow var(--rd-t); }
.atlas-view-toggle .atlas-view-active { background: var(--rd-btn-bg); color: #04252b; box-shadow: var(--rd-btn-shadow); }
.route-leaflet-wrap, .route-rows-map {
  border: 1px solid var(--rd-line-strong); border-radius: var(--rd-r-lg);
  box-shadow: inset 0 0 0 1px rgba(54, 196, 217, 0.06), 0 16px 34px -14px rgba(0, 0, 0, 0.8), 0 0 28px -12px rgba(54, 196, 217, 0.5);
}
.route-leaflet-map { background: #0b2a31; }
.app-root .leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) brightness(1.15) contrast(.82) saturate(.4) sepia(.6) hue-rotate(115deg) saturate(1.8); }
.route-leaflet-wrap::after, .route-rows-map .route-leaflet-wrap::after {
  content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; z-index: 450;
  box-shadow: inset 0 0 40px rgba(6, 20, 24, 0.55);
}
.app-root .leaflet-bar { border: 1px solid var(--rd-line-strong); border-radius: 14px; overflow: hidden; box-shadow: 0 8px 20px -8px rgba(0, 0, 0, 0.7); }
.app-root .leaflet-bar a, .app-root .leaflet-bar a:hover {
  background-color: rgba(7, 25, 29, 0.88); color: #e9fbfd; border-bottom: 1px solid rgba(54, 196, 217, 0.25); width: 34px; height: 34px; line-height: 33px;
}
.app-root .leaflet-bar a:hover { background-color: rgba(23, 52, 58, 0.95); }
.app-root .leaflet-bar a:last-child { border-bottom: 0; }
.app-root .leaflet-control-attribution { background: rgba(6, 20, 24, 0.7); color: var(--text-dim2); border-top-left-radius: 8px; }
.app-root .leaflet-control-attribution a { color: var(--accent); }
.atlas-cluster { border-color: #fff; color: #04252b; font-weight: 800; box-shadow: 0 0 0 5px rgba(255, 255, 255, 0.14), 0 0 18px rgba(54, 196, 217, 0.6), 0 2px 8px rgba(0, 0, 0, 0.55); }
.atlas-cluster-t1 { background: #36C4D9; }
.atlas-cluster-t2 { background: #22AFC6; color: #fff; }
.atlas-cluster-t3 { background: #148FA6; color: #fff; }
.atlas-cluster-active { box-shadow: 0 0 0 7px rgba(255, 255, 255, 0.4), 0 0 24px rgba(54, 196, 217, 0.85), 0 2px 10px rgba(0, 0, 0, 0.6); }
.atlas-cluster-label { background: rgba(6, 20, 24, 0.85); color: var(--text); border: 1px solid var(--rd-line); }
.atlas-count-note { color: var(--text-dim); background: rgba(240, 195, 120, 0.12); border: 1px solid rgba(240, 195, 120, 0.3); border-radius: 12px; padding: 9px 14px; display: inline-block; }
.atlas-tile { border: 1px solid var(--rd-line); border-radius: var(--rd-r); box-shadow: 0 10px 24px -10px rgba(0, 0, 0, 0.8), 0 0 20px -12px rgba(54, 196, 217, 0.5); }
.atlas-tile-cap { background: linear-gradient(180deg, rgba(7, 25, 29, 0) 0%, rgba(7, 25, 29, 0.9) 100%); }
.atlas-tile-text { color: var(--text-dim); background: var(--rd-card-bg); }
.atlas-back-btn, .postcard-map-toggle { color: var(--accent); }
.atlas-entry-tag { background: rgba(54, 196, 217, 0.13); color: #7fe3f1; }
.atlas-entry-save { border-color: var(--rd-line-strong); color: var(--text); background: rgba(54, 196, 217, 0.08); transition: background var(--rd-t), border-color var(--rd-t); }
.atlas-entry-save:hover { background: rgba(54, 196, 217, 0.16); }
.atlas-entry-saved { color: var(--accent); border-color: var(--accent); background: rgba(54, 196, 217, 0.16); }

/* ---- Van Atlas: location Bottom Sheet ---- */
.atlas-sheet {
  position: fixed; left: 0; right: 0; margin-left: auto; margin-right: auto; width: 100%; max-width: 460px;
  bottom: var(--sheet-bottom, var(--tabbar-h)); z-index: 19;
  display: flex; flex-direction: column; box-sizing: border-box;
  height: var(--sheet-h, 50vh); height: var(--sheet-h, 50dvh);
  max-height: calc(100vh - var(--sheet-bottom, var(--tabbar-h)) - 12px); max-height: calc(100dvh - var(--sheet-bottom, var(--tabbar-h)) - max(12px, env(safe-area-inset-top, 0px)));
  background: linear-gradient(180deg, #123a42 0%, #0a232a 38%, #08191e 100%);
  border: 1px solid var(--rd-line-strong); border-bottom: 0; border-radius: 28px 28px 0 0;
  box-shadow: 0 -18px 44px -10px rgba(0, 0, 0, 0.7), 0 0 34px -8px rgba(54, 196, 217, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.07);
  transition: height 0.3s var(--rd-ease);
  animation: atlasSheetIn 0.3s var(--rd-ease);
  color: var(--text);
}
.atlas-sheet[data-snap="collapsed"] { --sheet-h: 96px; }
.atlas-sheet[data-snap="half"] { --sheet-h: 50dvh; }
.atlas-sheet[data-snap="full"] { --sheet-h: 100dvh; }
.atlas-sheet-dragging { transition: none; }
@keyframes atlasSheetIn { from { transform: translateY(26px); opacity: 0; } to { transform: none; opacity: 1; } }
.atlas-sheet-drag { flex: none; touch-action: none; cursor: grab; user-select: none; -webkit-user-select: none; }
.atlas-sheet-dragging .atlas-sheet-drag { cursor: grabbing; }
.atlas-sheet-grab { display: flex; align-items: center; justify-content: center; width: 100%; height: 26px; padding: 0; border: 0; background: none; cursor: inherit; }
.atlas-sheet-grab-bar { width: 44px; height: 5px; border-radius: 5px; background: rgba(54, 196, 217, 0.55); box-shadow: 0 0 10px rgba(54, 196, 217, 0.45); transition: background var(--rd-t), width var(--rd-t); }
.atlas-sheet-grab:hover .atlas-sheet-grab-bar { background: var(--accent); width: 54px; }
.atlas-sheet-head { display: flex; align-items: center; gap: 12px; padding: 0 12px 12px 18px; }
.atlas-sheet-pin { flex: none; display: flex; color: #ff6b5e; filter: drop-shadow(0 0 8px rgba(255, 107, 94, 0.45)); }
.atlas-sheet-titles { flex: 1; min-width: 0; }
.atlas-sheet-title { margin: 0; font-family: 'Playfair Display', Georgia, serif; font-style: italic; font-weight: 600; font-size: 25px; line-height: 1.12; color: #fff; overflow-wrap: anywhere; text-shadow: 0 2px 14px rgba(0, 0, 0, 0.5); }
.atlas-sheet-title:focus { outline: none; }
.atlas-sheet-title:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 4px; }
.atlas-sheet-sub { margin-top: 3px; font-size: 12.5px; color: var(--text-dim); }
.atlas-sheet-actions { flex: none; display: flex; align-items: center; gap: 6px; }
.atlas-sheet-btn {
  width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  background: var(--rd-glass); border: 1px solid var(--rd-line-strong); color: var(--text); cursor: pointer;
  transition: background var(--rd-t), border-color var(--rd-t), transform var(--rd-t);
}
.atlas-sheet-btn:hover { background: rgba(54, 196, 217, 0.18); border-color: var(--accent); }
.atlas-sheet-btn:active { transform: scale(0.94); }
.atlas-sheet-body {
  flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain;
  padding: 2px 16px calc(18px + env(safe-area-inset-bottom, 0px)); border-top: 1px solid rgba(54, 196, 217, 0.14);
}
.atlas-sheet-place { margin: 16px 0 4px; font-family: 'Poppins', sans-serif; font-weight: 700; font-size: 15px; color: #fff; display: flex; align-items: center; gap: 7px; }
.atlas-sheet-place::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: #ff6b5e; box-shadow: 0 0 8px rgba(255, 107, 94, 0.7); flex: none; }
.atlas-sheet-section { margin: 18px 0 4px; }
.atlas-sheet-h { display: flex; align-items: center; gap: 9px; margin: 0 0 10px; font-family: 'Poppins', sans-serif; font-weight: 600; font-size: 14.5px; color: #7fe3f1; }
.atlas-sheet-h svg { flex: none; color: var(--accent); }
.atlas-sheet-entry + .atlas-sheet-entry { margin-top: 10px; }
.atlas-sheet-entry > .atlas-entry-card { border: 1px solid var(--rd-line); border-radius: var(--rd-r); background: var(--rd-card-bg-flat); padding: 12px 14px; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04); }
.atlas-sheet-entry > .atlas-entry-card:first-of-type { padding-top: 12px; }
.atlas-sheet-entry .atlas-entry-kind { display: none; }
.atlas-sheet-entry .atlas-entry-story { color: var(--text-dim); }
.atlas-sheet-entry > .atlas-postcard { padding: 0; background: none; border: 0; box-shadow: none; }
.atlas-sheet-entry > .atlas-postcard .atlas-postcard-actions { padding: 2px 2px 0; }
.atlas-sheet-entry .pcard { margin: 0 0 10px; box-shadow: 0 12px 28px -10px rgba(0, 0, 0, 0.8); }
.atlas-sheet-entry .pcard .pcard-place { display: flex; }
.atlas-sheet-entry .pcard-front .atlas-entry-photo { max-height: 60vh; }
.atlas-sheet-more { padding: 12px 0 4px; text-align: center; }
/* very wide screens: a side panel next to the app column instead of a bottom sheet */
@media (min-width: 1280px) {
  .atlas-sheet, .atlas-sheet[data-snap] {
    left: calc(50% + 246px); right: auto; margin: 0; width: 380px; max-width: 380px; top: 24px; bottom: 24px; height: auto; max-height: none;
    border-radius: 26px; border-bottom: 1px solid var(--rd-line-strong); animation-name: atlasPanelIn;
  }
  .atlas-sheet-grab, .atlas-sheet-btn-size, .atlas-sheet-btn-fold { display: none; }
  .atlas-sheet-drag { cursor: default; touch-action: auto; }
  .atlas-sheet-head { padding-top: 18px; }
}
@keyframes atlasPanelIn { from { transform: translateX(24px); opacity: 0; } to { transform: none; opacity: 1; } }

/* ---- Song of the Day + poll + player ---- */
.content-kicker { background: rgba(7, 25, 29, 0.7); border-color: var(--rd-line-strong); color: #7fe3f1; }
.content-song-art {
  background:
    linear-gradient(135deg, rgba(7, 25, 29, 0.95) 0%, rgba(7, 25, 29, 0.68) 50%, rgba(7, 25, 29, 0.92) 100%),
    var(--sotd-art) center / cover no-repeat;
  box-shadow: var(--rd-shadow), var(--rd-glow);
}
.content-song .content-cta { background: var(--rd-btn-bg); color: #04252b; box-shadow: var(--rd-btn-shadow); }
.content-song .content-note { border-left-color: var(--accent); }
.sotd-tool { background: rgba(7, 25, 29, 0.55); border-color: var(--rd-line); }
.sotd-tool-on { border-color: var(--accent); background: rgba(54, 196, 217, 0.12); }
.poll-option { background: rgba(7, 25, 29, 0.6); border-color: var(--rd-line-strong); transition: background var(--rd-t), border-color var(--rd-t); }
.poll-option:hover { background: rgba(54, 196, 217, 0.14); border-color: var(--accent); }
.poll-result { background: rgba(7, 25, 29, 0.6); border-color: var(--rd-line); }
.poll-result-bar { background: rgba(54, 196, 217, 0.26); }
.promo-kicker { border-color: var(--rd-line-strong); }
.sp-sheet {
  background: radial-gradient(120% 60% at 80% 0%, rgba(54, 196, 217, 0.18) 0%, rgba(54, 196, 217, 0) 60%), linear-gradient(170deg, #0f3640 0%, #08202a 70%);
  border-color: var(--rd-line-strong); box-shadow: inset 0 0 0 1px rgba(54, 196, 217, 0.14), 0 14px 46px rgba(0, 0, 0, 0.6), 0 0 34px -10px rgba(54, 196, 217, 0.45);
}
.sp-backdrop { background: rgba(3, 12, 15, 0.78); }
.sp-play { box-shadow: 0 0 0 5px rgba(54, 196, 217, 0.12), 0 10px 26px -8px rgba(54, 196, 217, 0.6); }
.sp-range { --sp-fill: var(--accent); }

/* ---- Co-pilot chat ---- */
.chat-overlay { background: rgba(3, 12, 15, 0.72); }
.chat-join-card, .chat-panel { background: linear-gradient(180deg, #123037 0%, #0b2127 100%); border-top-color: var(--rd-line-strong); box-shadow: 0 -16px 40px -10px rgba(0, 0, 0, 0.7); }
.chat-msg-text { background: rgba(23, 52, 58, 0.8); border-color: var(--rd-line); }
.chat-msg-mine .chat-msg-text { background: linear-gradient(135deg, #1e8ba0, #176f82); border-color: var(--accent); }
.copilot-frame-bar { background: var(--surface); border-bottom-color: var(--rd-line); }

/* ---- motion ---- */
@media (prefers-reduced-motion: reduce) {
  .atlas-sheet { animation: none; transition: none; }
  .fade-in, .pill-btn, .hub-card, .tab-btn::before { animation: none; transition: none; }
}
`;
