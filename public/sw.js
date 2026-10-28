// Care : application installable.
// Pages : le réseau d'abord, toujours ; sans connexion, la dernière version vue de la page, sinon l'accueil.
// Tout le reste (espace élève, envois, fichiers, autres sites) passe sans être touché.
const CACHE = 'care-v1';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/icones/icone-192.png'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || r.mode !== 'navigate') return;
  const u = new URL(r.url);
  if (u.origin !== self.location.origin || u.pathname.startsWith('/api/') || u.pathname.startsWith('/.netlify/')) return;
  e.respondWith(fetch(r).then((rep) => {
    if (rep.ok) { const copie = rep.clone(); caches.open(CACHE).then((c) => c.put(u.pathname, copie)); }
    return rep;
  }).catch(() => caches.match(u.pathname).then((x) => x || caches.match('/'))));
});
