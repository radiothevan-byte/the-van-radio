// PWA foundation: registers the minimal service worker (public/sw.js).
// Production only, so local dev (vite) never gets a service worker.
export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (!import.meta.env || !import.meta.env.PROD) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => { /* non-fatal */ });
  });
}
