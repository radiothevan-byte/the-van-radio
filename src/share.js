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

// Absolute, shareable links. Journey ids are the numbers from "#N" in the sheet.
export function journeyShareUrl(id) {
  return `${window.location.origin}/journey/${encodeURIComponent(id)}`;
}
export function postcardShareUrl(id) {
  return `${window.location.origin}/postcard/${encodeURIComponent(id)}`;
}
