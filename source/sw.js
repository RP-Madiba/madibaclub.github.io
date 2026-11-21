// Service worker : garde l'application sur l'appareil pour qu'elle s'ouvre tout de suite,
// même avec un réseau lent ou sans réseau.
// CACHE et FICHIERS sont remplis automatiquement à la construction (un nouveau nom à chaque version).
const CACHE = "madiba-dev";
const FICHIERS = ["./", "index.html", "app.js"];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil((async () => {
    // Première installation : les fichiers viennent d'être téléchargés par la page, on reprend ces copies.
    // Mise à jour : on va chercher la nouvelle version sur le serveur (« reload »).
    const premiere = !(await caches.keys()).some((k) => k.startsWith("madiba-"));
    const c = await caches.open(CACHE);
    await c.addAll(FICHIERS.map((f) => new Request(f, { cache: premiere ? "default" : "reload" })));
  })().catch(() => {}));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  ]));
});

// Ce qui ne change pas entre deux versions vient directement de l'appareil (aucune attente réseau).
// Le reste (pages, nouveaux fichiers) : réseau, puis copie gardée en secours.
const IMMUABLE = /^https:\/\/www\.gstatic\.com\/firebasejs\//;
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const local = url.origin === self.location.origin;
  if (!local && !IMMUABLE.test(req.url)) return; // Firebase, YouTube… : on ne s'en mêle pas
  if (local && url.pathname.includes("/source/")) return;
  const page = req.mode === "navigate";
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const garde = await cache.match(page ? "index.html" : req, { ignoreSearch: page });
    if (garde) return garde;
    try {
      const rep = await fetch(req);
      if (rep.ok && (local || rep.type === "cors")) cache.put(page ? "index.html" : req, rep.clone());
      return rep;
    } catch (err) {
      return (await cache.match("index.html")) || Response.error();
    }
  })());
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
