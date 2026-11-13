// Service worker : rend l'application installable et utilisable avec une connexion instable.
const CACHE = "madiba-v1";
const FICHIERS = ["./", "index.html", "style.css", "app.js", "firebase-config.js",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/logo-or.png"];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FICHIERS)).catch(() => {}));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  ]));
});

// Réseau d'abord (pour toujours avoir la dernière version), copie locale en secours.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then((rep) => {
      const copie = rep.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copie));
      return rep;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match("index.html")))
  );
});
