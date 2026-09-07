/* Macro Ledger service worker — makes the app work with the network off, for good. */
const V = "macro-ledger-v16";
const SHELL = [
  "./", "./index.html", "./manifest.webmanifest",
  "./manifest-gator.webmanifest", "./manifest-comic.webmanifest", "./manifest-bee.webmanifest",
  "./manifest-barbie.webmanifest", "./manifest-matrix.webmanifest", "./manifest-shamu.webmanifest",
  "./icon-180.png", "./icon-192.png", "./icon-512.png", "./icon-512-maskable.png",
  "./fonts/Fraunces-400.woff2", "./fonts/IBMPlexSans-400.woff2",
  "./fonts/IBMPlexMono-400.woff2", "./fonts/IBMPlexMono-500.woff2",
  "./vendor/zxing.js", "./game/game.css", "./game/game.js", "./game/dex.json", "./lift/lift.js", "./lift/lift.css", "./pixel/pixel.js", "./pixel/pixel.css", "./pixel/pixelify-400.woff2", "./pixel/pixelify-700.woff2", "./pixel/battle-bg.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  // The page itself: prefer a fresh copy so updates land, fall back to cache
  // offline. Each skin has its own entry page, so cache by the page actually
  // asked for -- keying everything to index.html would hand a skinned install
  // the plain app the moment it went offline.
  if (req.mode === "navigate") {
    const url = new URL(req.url);
    const key = url.pathname.endsWith("/") ? url.pathname + "index.html" : url.pathname;
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(V).then(c => c.put(key, copy));
          return res;
        })
        .catch(() => caches.match(key)
          .then(r => r || caches.match("./index.html"))
          .then(r => r || caches.match("./")))
    );
    return;
  }

  // Fonts, icons, manifest: cache first, they never change without a version bump.
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(V).then(c => c.put(req, copy));
      }
      return res;
    }))
  );
});
