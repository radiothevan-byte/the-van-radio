// THE VAN — minimal Greek/English layer.
//
// Greek is the default and the original text of the app (existing users see
// exactly what they saw before). English is opt-in via the EL/EN toggle and is
// remembered in localStorage. Screens are translated progressively: any key that
// is missing in a language falls back to Greek, then to the key itself, so a
// half-translated screen can never show an empty label.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { SCREENS_EL, SCREENS_EN, PLACE_EN } from "./i18n-screens.js";

const LS_KEY = "tvr_lang";

export const DICT = {
  el: {
    "hero.alt": "Το Van σε παραλιακό δρόμο την ώρα του ηλιοβασιλέματος",
    "hero.title": "Όλοι έχουμε μια διαδρομή να μοιραστούμε.",
    "hero.sub": "Μουσική, τόποι και άνθρωποι. Η επόμενη διαδρομή ξεκινάει από εσένα.",
    "hub.atlas": "Ανακάλυψε τόπους, τραγούδια και ιστορίες σε όλη την Ελλάδα.",
    "hub.route": "Διάλεξε προορισμό, μουσικό ύφος και το τραγούδι σου.",
    "hub.postcards": "Μοιράσου μια ιστορία, μια φωτογραφία, έναν τόπο που αγαπάς.",
    "hub.journeys.title": "Οι ραδιοφωνικές μας διαδρομές",
    "hub.journeys.text": "Άκου τις ηχογραφημένες ραδιοφωνικές μας εκπομπές.",
    "hub.roadbook": "Η φιλοσοφία και το όραμα πίσω από το The Van.",
    "live.now": "Ζωντανά τώρα",
    "lang.switchTo": "Switch to English",
    "promo.featured": "Προτεινόμενα",
    "promo.journeysFeatured": "Επιλεγμένες διαδρομές",
    "promo.ctaDefault": "Δες περισσότερα",
    "promo.type.JOURNEY_OF_WEEK": "Διαδρομή της εβδομάδας",
    "promo.type.FEATURED_JOURNEY": "Προτεινόμενη διαδρομή",
    "promo.type.REDISCOVER": "Ξαναθυμήσου",
    "promo.type.SPECIAL_JOURNEY": "Ειδική διαδρομή",
    "promo.type.LIVE_UPCOMING": "Σύντομα στον αέρα",
    "promo.type.NEW_FEATURE": "Νέο στο The Van",
    "promo.type.ANNOUNCEMENT": "Ανακοίνωση",
    "promo.type.COMMUNITY": "Κοινότητα",
    "community.title": "Κάνε το Van δικό σου",
    "community.route.title": "Στείλε μας σε έναν προορισμό",
    "community.route.text": "Διάλεξε ένα μέρος και το τραγούδι που του ταιριάζει.",
    "community.route.cta": "Pick the Route",
    "community.postcards.title": "Μοιράσου μια καρτ ποστάλ",
    "community.postcards.text": "Μια φωτογραφία, μια ιστορία, ένας τόπος που αγαπάς.",
    "community.postcards.cta": "Postcards from the Road",
    "community.atlas.title": "Περιπλανήσου στον Atlas",
    "community.atlas.text": "Δες πού έχουν ταξιδέψει οι ιστορίες της κοινότητας.",
    "community.atlas.cta": "Van Atlas",
    "community.journeys.title": "Ανακάλυψε κι άλλες διαδρομές",
    "community.journeys.text": "Οι ηχογραφημένες εκπομπές μας σε περιμένουν.",
    "community.journeys.cta": "Journeys",
    "community.share.title": "Πες το σε έναν φίλο",
    "community.share.text": "Στείλε το The Van σε κάποιον που θα το αγαπήσει.",
    "community.share.cta": "Μοιράσου",
    "community.share.copied": "Ο σύνδεσμος αντιγράφηκε",
    "share.appText": "The Van — Radio On Wheels",
  },
  en: {
    "hero.alt": "The Van on a coastal road at sunset",
    "hero.title": "We all have a route to share.",
    "hero.sub": "Music, places and people. The next route starts with you.",
    "hub.atlas": "Discover places, songs and stories all across Greece.",
    "hub.route": "Choose a destination, a music style and your song.",
    "hub.postcards": "Share a story, a photo, a place you love.",
    "hub.journeys.title": "Our radio journeys",
    "hub.journeys.text": "Listen to our recorded radio shows.",
    "hub.roadbook": "The philosophy and vision behind The Van.",
    "live.now": "Live now",
    "lang.switchTo": "Μετάβαση στα Ελληνικά",
    "promo.featured": "Featured",
    "promo.journeysFeatured": "Featured Journeys",
    "promo.ctaDefault": "Learn more",
    "promo.type.JOURNEY_OF_WEEK": "Journey of the Week",
    "promo.type.FEATURED_JOURNEY": "Featured Journey",
    "promo.type.REDISCOVER": "Rediscover",
    "promo.type.SPECIAL_JOURNEY": "Special Journey",
    "promo.type.LIVE_UPCOMING": "Coming up live",
    "promo.type.NEW_FEATURE": "New in The Van",
    "promo.type.ANNOUNCEMENT": "Announcement",
    "promo.type.COMMUNITY": "Community",
    "community.title": "Make the Van yours",
    "community.route.title": "Send us to a destination",
    "community.route.text": "Pick a place and the song that belongs to it.",
    "community.route.cta": "Pick the Route",
    "community.postcards.title": "Share a postcard",
    "community.postcards.text": "A photo, a story, a place you love.",
    "community.postcards.cta": "Postcards from the Road",
    "community.atlas.title": "Wander the Atlas",
    "community.atlas.text": "See where the community's stories have travelled.",
    "community.atlas.cta": "Van Atlas",
    "community.journeys.title": "Discover more Journeys",
    "community.journeys.text": "Our recorded shows are waiting for you.",
    "community.journeys.cta": "Journeys",
    "community.share.title": "Tell a friend",
    "community.share.text": "Send The Van to someone who'll love it.",
    "community.share.cta": "Share",
    "community.share.copied": "Link copied",
    "share.appText": "The Van — Radio On Wheels",
  },
};

Object.assign(DICT.el, SCREENS_EL);
Object.assign(DICT.en, SCREENS_EN);

function fill(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m));
}

// translate(lang, key, vars?) — missing key in a language falls back to Greek, then to the key.
export function translate(lang, key, vars) {
  const d = DICT[lang] || DICT.el;
  if (Object.prototype.hasOwnProperty.call(d, key)) return fill(d[key], vars);
  if (Object.prototype.hasOwnProperty.call(DICT.el, key)) return fill(DICT.el[key], vars);
  return key;
}

// Display-only place name (stored/submitted values stay Greek).
export function placeLabel(lang, name) {
  if (lang !== "en" || !name) return name;
  if (PLACE_EN[name]) return PLACE_EN[name];
  return String(name).replace(/^Σημείο \(/, "Point (");
}

function readStoredLang() {
  try {
    const v = window.localStorage.getItem(LS_KEY);
    if (v === "el" || v === "en") return v;
  } catch (e) { /* storage unavailable */ }
  return "el"; // default: existing behaviour, Greek
}

const LangContext = createContext({ lang: "el", setLang: () => {}, toggleLang: () => {}, t: (k, v) => translate("el", k, v), pn: (n) => n });

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(() => (typeof window !== "undefined" ? readStoredLang() : "el"));
  const setLang = useCallback((next) => {
    const v = next === "en" ? "en" : "el";
    setLangState(v);
    try { window.localStorage.setItem(LS_KEY, v); } catch (e) { /* ignore */ }
  }, []);
  const toggleLang = useCallback(() => setLang(lang === "en" ? "el" : "en"), [lang, setLang]);
  useEffect(() => {
    try { document.documentElement.lang = lang; } catch (e) { /* ignore */ }
  }, [lang]);
  const value = useMemo(() => ({ lang, setLang, toggleLang, t: (k, v) => translate(lang, k, v), pn: (n) => placeLabel(lang, n) }), [lang, setLang, toggleLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}

// Small EL | EN pill (styled in promotions.jsx's PROMO_CSS with the other new styles).
export function LangToggle() {
  const { lang, toggleLang, t } = useLang();
  return (
    <button type="button" className="top-action-btn lang-toggle" onClick={toggleLang} aria-label={t("lang.switchTo")} title={t("lang.switchTo")}>
      <span className={lang === "el" ? "lang-on" : "lang-off"}>EL</span>
      <span className="lang-sep">|</span>
      <span className={lang === "en" ? "lang-on" : "lang-off"}>EN</span>
    </button>
  );
}
