// Link-preview picture for a shared postcard: /api/og?id=<postcard id>
// Draws the postcard (photo, place, story, song, signature, stamp) with a discreet
// "The Van Web App" line, so WhatsApp / Messenger / Instagram DM / etc. show the card itself.
//
// PRIVACY: data comes ONLY from the Apps Script "approved_postcards" endpoint (Status = Approved AND
// Consent to Publish = TRUE). Unknown / unapproved id, or any error -> redirect to the default
// preview image, never an error that confirms a hidden postcard exists. No secrets are used.
import { ImageResponse } from "@vercel/og";

export const config = { runtime: "edge" };

const WEBHOOK = "https://script.google.com/macros/s/AKfycbzKzq7vKbWAw6PwmGoPenTpv194K_64CfcY3Gd5KcGDduu6H8z1FNmgt6z11aCMlghujg/exec";
const BLUE = "#2C86A6";
const INK = "#2a2620";

function clip(text, max) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}
const httpsUrl = (u) => (/^https:\/\//i.test(String(u || "").trim()) ? String(u).trim() : "");

// Minimal element builder (no JSX build step in /api).
function h(type, style, children, extra) {
  const kids = Array.isArray(children) ? children.filter((c) => c !== null && c !== false && c !== undefined) : children;
  const base = type === "div" ? { display: "flex", ...style } : style;
  return { type, props: { ...(extra || {}), style: base, children: kids } };
}

// Inter (has Greek) subset to just the characters used, from Google Fonts; TTF so satori can read it.
async function loadFont(weight, text) {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Inter:wght@${weight}&text=${encodeURIComponent(text)}`)).text();
  const m = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/);
  if (!m) throw new Error("font url not found");
  const res = await fetch(m[1]);
  if (!res.ok) throw new Error("font fetch failed");
  return res.arrayBuffer();
}

export default async function handler(request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const fallback = () => Response.redirect(`${origin}/og-default.png`, 302);
  try {
    const id = url.searchParams.get("id") || "";
    if (!/^[\w.:-]{1,100}$/.test(id)) return fallback();
    const r = await fetch(`${WEBHOOK}?action=approved_postcards`);
    if (!r.ok) return fallback();
    const data = await r.json();
    if (!data || data.ok !== true || !Array.isArray(data.postcards)) return fallback();
    const p = data.postcards.find((x) => String(x.id || "") === id);
    if (!p) return fallback();

    const photo = httpsUrl(p.photoUrl);
    const place = clip(p.placeName, 48);
    const hasSong = !!(String(p.songTitle || "").trim() || String(p.artist || "").trim());
    const story = clip(p.story, hasSong ? 150 : 230);
    const songTitle = clip(p.songTitle, 44);
    const artist = clip(p.artist, 44);
    const who = clip(p.displayName, 40);
    const labels = ["ΤΙΤΛΟΣ ΤΡΑΓΟΥΔΙΟΥ", "ΚΑΛΛΙΤΕΧΝΗΣ", "The Van Web App", "THE VAN", "— "];
    const text = [place, story, songTitle, artist, who, ...labels, "0123456789"].join("");
    const [regular, bold] = await Promise.all([loadFont(500, text), loadFont(700, text)]);

    const van = {
      type: "svg",
      props: {
        width: 44, height: 44, viewBox: "0 0 24 24", fill: "none", stroke: "#fffaf0", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round",
        children: [
          { type: "path", props: { d: "M6 4.2h9.5" } },
          { type: "path", props: { d: "M7.8 4.2v1.8M13.7 4.2v1.8" } },
          { type: "path", props: { d: "M3 17.4V8.6A2.6 2.6 0 0 1 5.6 6h9.5a2.6 2.6 0 0 1 2.1 1.1l2.7 3.7a2.6 2.6 0 0 1 .5 1.5v5.1" } },
          { type: "path", props: { d: "M3 17.4h1.6M8.6 17.4h6.8M19.4 17.4h1.5" } },
          { type: "path", props: { d: "M3 12.2h16.9M9.9 6v6.2M14.7 6v6.2" } },
          { type: "circle", props: { cx: 6.6, cy: 17.4, r: 2 } },
          { type: "circle", props: { cx: 17.4, cy: 17.4, r: 2 } },
        ],
      },
    };
    const stamp = h("div", {
      position: "absolute", top: 0, right: 0, width: 92, height: 112, background: "#fffaf0", padding: 6, transform: "rotate(4deg)",
      boxShadow: "0 2px 6px rgba(0,0,0,.35)",
    }, h("div", {
      flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, background: "linear-gradient(160deg, #39ACD0, #2C86A6)", border: "2px solid #fffaf0",
    }, [van, h("div", { fontSize: 13, fontWeight: 700, color: "#fffaf0", letterSpacing: 2 }, "THE VAN")]));

    const field = (label, value) => h("div", { flexDirection: "column", marginTop: 6 }, [
      h("div", { fontSize: 15, fontWeight: 700, color: "rgba(42,38,32,.62)", letterSpacing: 1.5 }, label),
      h("div", { fontSize: 28, fontWeight: 700, color: INK }, value),
    ]);

    const textCol = h("div", { flex: 1, flexDirection: "column", position: "relative", minWidth: 0 }, [
      stamp,
      place ? h("div", { fontSize: 40, fontWeight: 700, color: INK, maxWidth: photo ? 470 : 860, lineHeight: 1.15, marginTop: 4 }, place) : null,
      story ? h("div", { fontSize: 25, fontWeight: 500, color: "#3d372e", lineHeight: 1.4, marginTop: 14, maxWidth: photo ? 470 : 860 }, story) : null,
      hasSong ? h("div", { flexDirection: "column", marginTop: 18, padding: "10px 16px", background: "rgba(42,38,32,.07)", borderLeft: `6px solid ${BLUE}`, borderRadius: 10 }, [
        songTitle ? field("ΤΙΤΛΟΣ ΤΡΑΓΟΥΔΙΟΥ", songTitle) : null,
        artist ? field("ΚΑΛΛΙΤΕΧΝΗΣ", artist) : null,
      ]) : null,
      who ? h("div", { marginTop: "auto", alignSelf: "flex-end", fontSize: 26, fontWeight: 500, color: BLUE }, `— ${who}`) : null,
    ]);

    const photoBox = photo ? h("div", { width: 460, height: 496, background: "#e4ded1", borderRadius: 8, alignItems: "center", justifyContent: "center", overflow: "hidden" },
      h("img", { width: 460, height: 496, objectFit: "contain" }, undefined, { src: photo })) : null;

    const tree = h("div", { width: 1200, height: 630, flexDirection: "column", alignItems: "center", justifyContent: "center", background: "linear-gradient(180deg, #0e1416, #080b0c)", fontFamily: "Inter" }, [
      h("div", { width: 1144, height: 540, background: "#f3efe6", borderRadius: 24, padding: 22, gap: 24, boxShadow: "0 12px 40px rgba(0,0,0,.5)" }, [photoBox, textCol]),
      h("div", { marginTop: 14, fontSize: 21, fontWeight: 500, color: "rgba(255,255,255,.55)", letterSpacing: 2 }, "The Van Web App"),
    ]);

    return new ImageResponse(tree, {
      width: 1200,
      height: 630,
      fonts: [{ name: "Inter", data: regular, weight: 500, style: "normal" }, { name: "Inter", data: bold, weight: 700, style: "normal" }],
      headers: { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (e) {
    return fallback();
  }
}
