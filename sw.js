const CACHE_NAME = "castellarium-cache-v1";
const FILES_TO_CACHE = [
  "/",
  "/index.html",
  "/app.js",
  "/maps.js",
  "/auth.js",
  "/auth-ui.js",
  "/chateaux.json",
  "/photopagedegarde.jpg",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

// Installation
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

// Activation
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => key !== CACHE_NAME && caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then(
      (response) => response || fetch(event.request)
    )
  );
});
