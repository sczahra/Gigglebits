const CACHE = "gigglebits-whitecat-sprite-v041";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./main.js",
  "./manifest.webmanifest",
  "./icon-512.png",
  "./cat.png",
  "./frames/merry_00.png",
  "./frames/merry_01.png",
  "./frames/merry_02.png",
  "./frames/merry_03.png",
  "./frames/merry_04.png",
  "./frames/merry_05.png",
  "./frames/merry_06.png",
  "./frames/merry_07.png",
  "./frames/merry_08.png",
  "./frames/merry_09.png",
  "./frames/merry_10.png",
  "./frames/merry_11.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k === CACHE) ? null : caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  event.respondWith((async () => {
    const cached = await caches.match(req, {});
    if (cached) return cached;
    try{
      const fresh = await fetch(req);
      const cache = await caches.open(CACHE);
      cache.put(req, fresh.clone());
      return fresh;
    }catch{
      return caches.match("./index.html");
    }
  })());
});
