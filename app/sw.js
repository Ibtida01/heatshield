// Offline support: app shell cache-first, weather network-first with cache fallback.
const VERSION = 'heatshield-v1';
const SHELL = ['./', './index.html', './css/app.css', './manifest.webmanifest',
  './js/main.js', './js/models.js', './js/weather.js', './js/sim.js', './js/monitor.js', './js/i18n.js',
  './js/voice.js', './js/ble.js', './js/signs.js', './js/chart.js',
  './model/calibration.json', './data/fallback_day.json', './audio/manifest.json',
  './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname.endsWith('open-meteo.com') || url.hostname.includes('fonts.g')) {
    e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
