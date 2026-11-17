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
 *  - Push notifications (P7): a "push" handler shows the message, a "notificationclick" handler opens
 *    a same-site page. Nothing else about caching/fetching changes.
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

// ---------------------------------------------------------------------------------------------
// Push notifications (P7). The payload is JSON {title, body, url, tag}; only same-site paths are opened.
function safePath(u) {
  const s = typeof u === "string" ? u : "/";
  return s.startsWith("/") && !s.startsWith("//") && !/[\\\s]/.test(s) ? s.slice(0, 200) : "/";
}

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  const title = (typeof data.title === "string" && data.title ? data.title : "THE VAN").slice(0, 80);
  const options = {
    body: (typeof data.body === "string" ? data.body : "").slice(0, 160),
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: safePath(data.url) },
  };
  if (typeof data.tag === "string" && data.tag) options.tag = data.tag.slice(0, 64);
  // userVisibleOnly: a notification must always be shown for every push.
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = safePath(event.notification.data && event.notification.data.url);
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).origin === self.location.origin && "focus" in c) {
          return c.focus().then(() => ("navigate" in c ? c.navigate(target).catch(() => null) : null));
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(target) : null;
    })
  );
});
