// Minimal service worker (PWA-ready).
// Keeps it intentionally simple: cache the app shell and allow offline reload of last visited assets.
// Bump cache name to ensure clients pick up new builds (avoids stale JS after deploy).
const CACHE_NAME = "maia-pwa-v3";
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest", "/favicon.ico"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k === CACHE_NAME ? Promise.resolve() : caches.delete(k)))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(
    (async () => {
      // Never cache API calls; also never "fallback to index.html" for API,
      // because that would make the app think health/generate returned null.
      try {
        const url = new URL(req.url);
        if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
          return await fetch(req);
        }
      } catch {
        // ignore URL parse errors
      }

      const cached = await caches.match(req);
      if (cached) return cached;

      try {
        const res = await fetch(req);
        // Cache same-origin static assets (best effort)
        try {
          const url = new URL(req.url);
          if (url.origin === self.location.origin && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
        } catch {
          // ignore
        }
        return res;
      } catch {
        // Only fall back to the app shell for navigations (offline reload),
        // not for images/json/etc.
        if (req.mode === "navigate") {
          return (await caches.match("/")) || (await caches.match("/index.html"));
        }
        throw new Error("Network error");
      }
    })(),
  );
});

