/* I Follow the Sun — service worker.
 *
 * Lo genera el build: `scripts/pwa/build-sw.ts` sustituye la versión y la lista de precarga en
 * dist/sw.js. Este fichero de public/ solo sirve de plantilla (en desarrollo no se registra).
 *
 * Estrategias:
 *   HTML (navegación)            red primero (4 s) → copia en caché → la app (/) en caché
 *   /assets/* (con hash)         caché primero; son inmutables
 *   /data/*.json                 caché y revalidación en segundo plano
 *   teselas y fuentes del mapa   caché y revalidación, con tope de entradas
 *   APIs (meteo, Overpass, CKAN) sin tocar: la app ya tiene sus propias cachés
 * Nunca se guardan peticiones que no sean GET ni respuestas fallidas u opacas.
 */
const VERSION = "__FTS_SW_VERSION__";
const PRECACHE = /* __FTS_PRECACHE__ */ [];

const SHELL = `fts-shell-${VERSION}`;
const PAGES = "fts-pages-v1";
const ASSETS = "fts-assets-v1";
const DATA = "fts-data-v1";
const TILES = "fts-tiles-v1";
const FONTS = "fts-fonts-v1";
const KEEP = new Set([SHELL, PAGES, ASSETS, DATA, TILES, FONTS]);

const LIMITS = { [PAGES]: 40, [ASSETS]: 120, [TILES]: 600, [FONTS]: 30, [DATA]: 10 };
const NAV_TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => undefined)
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("fts-") && !KEEP.has(key)) await caches.delete(key);
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

/** Una respuesta que merece la pena guardar: completa, sin error y no opaca. */
const cacheable = (res) => !!res && res.ok && res.status === 200 && res.type !== "opaque";

async function trim(cacheName) {
  const max = LIMITS[cacheName];
  if (!max) return;
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function put(cacheName, request, response) {
  if (!cacheable(response)) return;
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
  void trim(cacheName);
}

/** La página pedida si ya se visitó; si no, la app (/), que sabe abrir cualquier ruta. */
async function fallbackPage(request) {
  return (await caches.match(request, { ignoreSearch: true })) || (await caches.match("/", { cacheName: SHELL }));
}

async function networkFirstPage(request, event) {
  const network = fetch(request).then((res) => {
    if (cacheable(res)) void put(PAGES, request, res.clone());
    return res;
  });
  const slow = new Promise((resolve) => setTimeout(resolve, NAV_TIMEOUT_MS, "slow"));
  try {
    const first = await Promise.race([network, slow]);
    if (first !== "slow") return first;
    // Red lenta: se sirve la copia y la red sigue en segundo plano; sin copia, se espera a la red.
    const cached = await fallbackPage(request);
    if (cached) {
      event.waitUntil(network.catch(() => undefined));
      return cached;
    }
    return await network;
  } catch {
    const cached = await fallbackPage(request);
    if (cached) return cached;
    return new Response("Sin conexión", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

async function cacheFirst(cacheName, request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  void put(cacheName, request, res.clone());
  return res;
}

async function staleWhileRevalidate(cacheName, request, event) {
  const cached = await caches.match(request);
  const network = fetch(request)
    .then((res) => {
      void put(cacheName, request, res.clone());
      return res;
    })
    .catch(() => undefined);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  const res = await network;
  return res || new Response("", { status: 504 });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (request.mode === "navigate") {
      event.respondWith(networkFirstPage(request, event));
      return;
    }
    if (url.pathname.startsWith("/assets/")) {
      event.respondWith(cacheFirst(ASSETS, request));
      return;
    }
    if (url.pathname.startsWith("/data/") && url.pathname.endsWith(".json")) {
      event.respondWith(staleWhileRevalidate(DATA, request, event));
      return;
    }
    if (url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest") {
      event.respondWith(cacheFirst(SHELL, request));
    }
    return;
  }

  if (url.hostname === "tiles.openfreemap.org") {
    event.respondWith(staleWhileRevalidate(TILES, request, event));
    return;
  }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(FONTS, request, event));
  }
  // El resto (Open-Meteo, Overpass, Open Data BCN, Vercel Analytics) va directo a la red.
});
