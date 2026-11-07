/* THE VAN — minimal, conservative service worker.
 *
 * Goals: installability + a basic offline fallback. Nothing else.
 *  - It NEVER touches cross-origin requests (Live Radio stream, recorded audio hosts,
 *    Google Sheets / Apps Script, Firebase, OpenStreetMap tiles, routing APIs, analytics).
 *  - It NEVER touches audio/video or any request carrying a Range header.
 *  - Page navigations are NETWORK-FIRST, so a new deployment is always picked up
 *    immediately; the cached shell / offline page is used only when the network fails.
 *  - Hashed build files (/assets/*) are cache-first (they are immutable by name).
 *  - Everything else falls through to the browser untouched.
 * Bump CACHE_VERSION to force-clear old caches.
 */
const CACHE_VERSION = "v1";
const SHELL_CACHE = "thevan-shell-" + CACHE_VERSION;
const ASSET_CACHE = "thevan-assets-" + CACHE_VERSION;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll([OFFLINE_URL, "/icons/icon-192.png"])).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("thevan-") && k !== SHELL_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                 // cross-origin: hands off (Live Radio etc.)
  if (req.headers.has("range")) return;                            // audio/video seeking: hands off
  if (req.destination === "audio" || req.destination === "video") return;
  if (url.pathname.startsWith("/_vercel/")) return;                // Vercel analytics/insights

  // Page navigations: network first, fall back to cached app shell, then offline page.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put("/", copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches.open(SHELL_CACHE).then((c) => c.match("/").then((shell) => shell || c.match(OFFLINE_URL)))
            .then((r) => r || new Response("Offline", { status: 503, headers: { "content-type": "text/plain" } }))
        )
    );
    return;
  }

  // Hashed build assets: cache first.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.open(ASSET_CACHE).then((cache) =>
        cache.match(req).then((hit) => hit || fetch(req).then((res) => {
          if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
          return res;
        }))
      )
    );
  }
  // anything else: not intercepted
});
