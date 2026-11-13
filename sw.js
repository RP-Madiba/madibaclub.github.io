// Service worker : rend l'application installable et utilisable avec une connexion instable.
const CACHE = "madiba-v7";
const FICHIERS = ["./", "index.html", "style.css", "app.js", "firebase-config.js", "i18n.js", "journal.js", "images/groupe.jpg",
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

// Notifications : affiche le message reçu, même quand l'application est fermée.
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = {}; }
  const n = d.notification || {}, x = d.data || {};
  const icone = new URL("icons/icon-192.png", self.registration.scope).href;
  e.waitUntil(self.registration.showNotification(x.title || n.title || "Madiba Club", {
    body: x.body || n.body || "", icon: icone, badge: icone,
    data: { url: x.url || self.registration.scope }
  }));
});

// Un appui sur la notification ouvre l'application à la bonne page.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((fenetres) => {
    const ouverte = fenetres.find((f) => f.url.startsWith(self.registration.scope));
    if (ouverte) return (ouverte.navigate ? ouverte.navigate(url) : Promise.resolve(ouverte)).then((f) => (f || ouverte).focus());
    return self.clients.openWindow(url);
  }));
});
