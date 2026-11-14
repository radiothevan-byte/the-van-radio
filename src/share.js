// Native share sheet when the browser has one, otherwise copy the link.
// Resolves to "shared" | "copied" | "cancelled" | "failed". Never throws.
export async function shareLink({ title, text, url }) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      await navigator.share({ title, text, url });
      return "shared";
    }
  } catch (e) {
    if (e && e.name === "AbortError") return "cancelled"; // person closed the share sheet
    // any other share error: fall through to copying the link
  }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
      return "copied";
    }
  } catch (e) { /* try the legacy path */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = url;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok ? "copied" : "failed";
  } catch (e) {
    return "failed";
  }
}

// Can this browser hand an image FILE to the native share sheet? (Mobile Chrome/Safari yes; most desktops no.)
export function canShareImages() {
  try {
    if (typeof navigator === "undefined" || typeof navigator.share !== "function" || typeof navigator.canShare !== "function") return false;
    return navigator.canShare({ files: [new File([new Blob(["x"], { type: "image/png" })], "postcard.png", { type: "image/png" })] });
  } catch (e) { return false; }
}

// Share a picture through the native sheet (the link goes in the caption, since some apps drop `url`
// when a file is attached). Resolves to "shared" | "cancelled" | "failed". Never throws.
// Call it straight from the click with an already-rendered blob so the browser still sees the tap.
export async function shareImage({ blob, filename, title, text, url }) {
  try {
    if (!blob) return "failed";
    const file = new File([blob], filename || "postcard.png", { type: "image/png" });
    if (!navigator.canShare || !navigator.canShare({ files: [file] })) return "failed";
    await navigator.share({ files: [file], title, text: url ? `${text} ${url}` : text });
    return "shared";
  } catch (e) {
    if (e && e.name === "AbortError") return "cancelled";
    return "failed";
  }
}

// Absolute, shareable links. Journey ids are the numbers from "#N" in the sheet.
export function journeyShareUrl(id) {
  return `${window.location.origin}/journey/${encodeURIComponent(id)}`;
}
export function postcardShareUrl(id) {
  return `${window.location.origin}/postcard/${encodeURIComponent(id)}`;
}
