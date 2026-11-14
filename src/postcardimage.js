// Renders a postcard (photo, place, story, song, signature, stamp) to a PNG so it can be
// shared as a picture (Instagram Stories/Feed, WhatsApp status, etc.) through the native share
// sheet. Pure canvas — no dependencies. Resolves to a Blob, or null when it cannot be drawn
// (e.g. the photo host sends no CORS headers); callers then fall back to the plain link share.
// 9:16 so an Instagram/WhatsApp Story fills the screen with no bars; the card sits in the centre 4:5 band, so a Feed crop keeps it whole.
const W = 1080, H = 1920, BAND = 1350, BAND_TOP = (H - BAND) / 2;
const PAPER = "#f3efe6", INK = "#2a2620", BLUE = "#2C86A6";
const SANS = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const HEAD = "Poppins, Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx, text, maxW, maxLines) {
  const words = String(text || "").replace(/\s+/g, " ").trim().split(" ");
  const lines = []; let cur = ""; let cut = false;
  for (let i = 0; i < words.length; i++) {
    const test = cur ? `${cur} ${words[i]}` : words[i];
    if (ctx.measureText(test).width <= maxW || !cur) { cur = test; continue; }
    lines.push(cur); cur = words[i];
    if (lines.length === maxLines) { cut = true; break; }
  }
  if (!cut && cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; cut = true; }
  if (cut || (lines.length === maxLines && words.join(" ").length > lines.join(" ").length)) {
    let last = lines[maxLines - 1] || "";
    while (last && ctx.measureText(last + "…").width > maxW) last = last.slice(0, -1).trimEnd();
    lines[maxLines - 1] = last + "…";
  }
  return lines;
}

function fit(ctx, text, maxW, size, weight, family, min) {
  let s = size;
  for (;;) {
    ctx.font = `${weight} ${s}px ${family}`;
    if (ctx.measureText(text).width <= maxW || s <= min) break;
    s -= 2;
  }
  let t = text;
  while (t.length > 1 && ctx.measureText(t).width > maxW) t = t.slice(0, -1);
  return t === text ? text : t.trimEnd() + "…";
}

function drawStamp(ctx, x, y) {
  const w = 120, h = 148;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2); ctx.rotate(0.05); ctx.translate(-w / 2, -h / 2);
  ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
  ctx.fillStyle = "#fffaf0"; ctx.fillRect(0, 0, w, h);
  ctx.shadowColor = "transparent";
  ctx.fillStyle = PAPER; // perforation holes
  for (let i = 0; i <= w; i += 15) { ctx.beginPath(); ctx.arc(i, 0, 5, 0, 7); ctx.arc(i, h, 5, 0, 7); ctx.fill(); }
  for (let j = 0; j <= h; j += 15) { ctx.beginPath(); ctx.arc(0, j, 5, 0, 7); ctx.arc(w, j, 5, 0, 7); ctx.fill(); }
  const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, "#39ACD0"); g.addColorStop(1, BLUE);
  ctx.fillStyle = g; ctx.fillRect(11, 11, w - 22, h - 22);
  ctx.strokeStyle = "rgba(255,250,240,.75)"; ctx.lineWidth = 2; ctx.strokeRect(17, 17, w - 34, h - 34);
  // the brand van (same outline as the Home tab icon), 24x24 viewBox scaled up
  ctx.save();
  ctx.translate(w / 2 - 33, 34); ctx.scale(66 / 24, 66 / 24);
  ctx.strokeStyle = "#fffaf0"; ctx.lineWidth = 1.7; ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const d of ["M6 4.2h9.5", "M7.8 4.2v1.8M13.7 4.2v1.8", "M3 17.4V8.6A2.6 2.6 0 0 1 5.6 6h9.5a2.6 2.6 0 0 1 2.1 1.1l2.7 3.7a2.6 2.6 0 0 1 .5 1.5v5.1", "M3 17.4h1.6M8.6 17.4h6.8M19.4 17.4h1.5", "M3 12.2h16.9M9.9 6v6.2M14.7 6v6.2"]) ctx.stroke(new Path2D(d));
  for (const cx of [6.6, 17.4]) { ctx.beginPath(); ctx.arc(cx, 17.4, 2, 0, 7); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle = "#fffaf0"; ctx.font = `800 17px ${HEAD}`; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  if ("letterSpacing" in ctx) ctx.letterSpacing = "2px";
  ctx.fillText("THE VAN", w / 2 + 1, h - 34);
  ctx.restore();
  // postmark
  ctx.save();
  ctx.translate(x - 62, y + 76); ctx.rotate(-0.17);
  ctx.strokeStyle = "rgba(42,38,32,.42)"; ctx.lineWidth = 2.6; ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(60, 56, 46, 0, 7); ctx.stroke();
  ctx.setLineDash([6, 8]); ctx.beginPath(); ctx.arc(60, 56, 32, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  for (const dy of [26, 56, 86]) { ctx.beginPath(); ctx.moveTo(112, dy); ctx.quadraticCurveTo(124, dy - 9, 136, dy); ctx.quadraticCurveTo(148, dy + 9, 160, dy); ctx.quadraticCurveTo(172, dy - 9, 184, dy); ctx.stroke(); }
  ctx.restore();
}

export async function renderPostcardImage(entry, labels) {
  try {
    if (typeof document === "undefined") return null;
    if (document.fonts && document.fonts.load) {
      try { await Promise.all([document.fonts.load(`700 40px Poppins`), document.fonts.load(`500 34px Inter`), document.fonts.load(`700 34px Inter`)]); } catch (e) { /* system fonts */ }
    }
    const hasPhoto = !!entry.photoUrl;
    const img = hasPhoto ? await loadImage(entry.photoUrl) : null;
    if (hasPhoto && !img) return null; // photo not drawable (no CORS) -> caller falls back to the link
    const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // backdrop + paper card
    ctx.fillStyle = BLUE; ctx.fillRect(0, 0, W, H); // brand blue, one flat colour
    ctx.translate(0, BAND_TOP); // everything below was laid out for a 1080x1350 band
    const CX = 56, CY = 52, CW = W - 112, CH = 1176, PAD = 40, IX = CX + PAD, IW = CW - PAD * 2;
    ctx.save(); ctx.shadowColor = "rgba(0,30,45,.38)"; ctx.shadowBlur = 36; ctx.shadowOffsetY = 10;
    ctx.fillStyle = PAPER; rr(ctx, CX, CY, CW, CH, 26); ctx.fill(); ctx.restore();

    // ---- measure the text first so the photo takes whatever height is left ----
    ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
    const place = entry.placeName ? fit(ctx, String(entry.placeName), 640, 54, 700, HEAD, 36) : "";
    const placeFont = ctx.font;
    const hasSong = !!(entry.songTitle || entry.artist);
    const SF = img ? 33 : 40, LH = img ? 46 : 58; // no photo -> bigger text fills the card
    ctx.font = `500 ${SF}px ${SANS}`;
    const storyLines = entry.story ? wrap(ctx, entry.story, 640, hasSong ? 4 : (img ? 6 : 11)) : [];
    const fields = [];
    if (entry.songTitle) fields.push([`♪ ${labels.songTitle}`, entry.songTitle]);
    if (entry.artist) fields.push([labels.artist, entry.artist]);
    const songH = hasSong ? 34 + fields.length * 84 + (entry.musicUrl ? 78 : 0) - (fields.length ? 14 : 0) : 0;
    const textBlockH = (place ? 78 : 0) + storyLines.length * LH + (storyLines.length ? 34 : 0) + songH + (hasSong ? 22 : 0) + (entry.displayName ? 56 : 0);
    const photoTop = CY + PAD;
    const photoH = Math.max(280, Math.min(640, CH - PAD * 2 - 34 - textBlockH));

    // ---- photo (the whole photo, never cropped) ----
    if (img) {
      ctx.fillStyle = "#e4ded1"; rr(ctx, IX, photoTop, IW, photoH, 8); ctx.fill();
      const s = Math.min(IW / img.naturalWidth, photoH / img.naturalHeight);
      const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
      ctx.save(); rr(ctx, IX, photoTop, IW, photoH, 8); ctx.clip();
      ctx.drawImage(img, IX + (IW - dw) / 2, photoTop + (photoH - dh) / 2, dw, dh); ctx.restore();
    }
    const shift = img ? 0 : Math.max(0, Math.round((CH - PAD * 2 - Math.max(textBlockH, 200) - 120) / 2)); // no photo: centre the text on the card
    let y = (img ? photoTop + photoH : photoTop + 24 + shift) + 16;
    if (img) { ctx.strokeStyle = "rgba(42,38,32,.28)"; ctx.lineWidth = 3; ctx.setLineDash([14, 10]); ctx.beginPath(); ctx.moveTo(IX, y); ctx.lineTo(IX + IW, y); ctx.stroke(); ctx.setLineDash([]); }
    y += 16;

    const stampTop = y + 6, stampBottom = stampTop + 160;
    drawStamp(ctx, IX + IW - 124, stampTop);

    // ---- place + story ----
    if (place) { y += 56; ctx.fillStyle = INK; ctx.font = placeFont; ctx.fillText(place, IX, y); y += 22; }
    if (storyLines.length) {
      ctx.fillStyle = "#3d372e"; ctx.font = `500 ${SF}px ${SANS}`;
      for (const ln of storyLines) { y += LH; ctx.fillText(ln, IX, y); }
      y += 34;
    }
    y = Math.max(y, 0);

    // ---- song block ----
    if (hasSong) {
      const bh = songH; const by = y;
      ctx.fillStyle = "rgba(42,38,32,.07)"; rr(ctx, IX, by, IW, bh, 14); ctx.fill();
      ctx.fillStyle = BLUE; ctx.fillRect(IX, by, 7, bh);
      let fy = by + 22;
      for (const [lab, val] of fields) {
        ctx.fillStyle = "rgba(42,38,32,.62)"; ctx.font = `700 21px ${SANS}`;
        if ("letterSpacing" in ctx) ctx.letterSpacing = "1.5px";
        ctx.fillText(String(lab).normalize("NFD").replace(/[\u0300-\u0344]/g, "").toUpperCase(), IX + 30, fy + 18);
        if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
        ctx.fillStyle = INK;
        const v = fit(ctx, String(val), IW - 60, 36, 700, SANS, 24);
        ctx.fillText(v, IX + 30, fy + 56); fy += 84;
      }
      if (entry.musicUrl) {
        const ly = by + bh - 62;
        ctx.strokeStyle = "rgba(42,38,32,.12)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(IX + 30, ly - 8); ctx.lineTo(IX + IW - 24, ly - 8); ctx.stroke();
        ctx.fillStyle = BLUE; ctx.beginPath(); ctx.arc(IX + 54, ly + 28, 24, 0, 7); ctx.fill();
        ctx.fillStyle = PAPER; ctx.beginPath(); ctx.moveTo(IX + 46, ly + 15); ctx.lineTo(IX + 46, ly + 41); ctx.lineTo(IX + 67, ly + 28); ctx.closePath(); ctx.fill();
        ctx.fillStyle = BLUE; ctx.font = `700 30px ${SANS}`; ctx.fillText(fit(ctx, labels.listen, IW - 130, 30, 700, SANS, 22), IX + 94, ly + 39);
      }
      y = by + bh + 22;
    }
    if (entry.displayName) {
      y = Math.max(y, stampBottom); // never under the stamp/postmark
      ctx.fillStyle = BLUE; ctx.font = `italic 500 34px ${SANS}`; ctx.textAlign = "right";
      ctx.fillText(fit(ctx, `— ${entry.displayName}`, IW, 34, 500, SANS, 22), IX + IW, y + 36); ctx.textAlign = "left";
    }

    // ---- footer: discreet brand line under the card ----
    ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,.82)"; ctx.font = `600 28px ${SANS}`;
    if ("letterSpacing" in ctx) ctx.letterSpacing = "2px";
    ctx.fillText("The Van Web App", W / 2, 1298);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";

    return await new Promise((resolve) => { try { canvas.toBlob((b) => resolve(b || null), "image/png"); } catch (e) { resolve(null); } });
  } catch (e) {
    return null; // tainted canvas / any drawing error -> link share fallback
  }
}
