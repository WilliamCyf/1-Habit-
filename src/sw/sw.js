// Repling's service worker: a small helper script the browser keeps beside
// the app. It sits between the app and the internet, like a shopkeeper with
// a stockroom. When the app asks for a file, the shopkeeper hands it over
// from the stockroom (the "cache") if it is there, so the app works with no
// internet at all.
//
// The three __PLACEHOLDERS__ below are filled in automatically when the app
// is built (see vite.config.ts).

const VERSION = '__VERSION__';
const HEAVY_VERSION = '__HEAVY_VERSION__';
/** Small files that make up the app itself. Stored when the app is installed. */
const SHELL = __SHELL__;
/** The 17 MB tracking engine and model. Stored on first use or in the background. */
const HEAVY = __HEAVY__;

const SHELL_CACHE = `repling-shell-${VERSION}`;
const HEAVY_CACHE = `repling-heavy-${HEAVY_VERSION}`;
const SCOPE = new URL(self.registration.scope).pathname;

// INSTALL: runs once when a new version of this file is found.
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // "reload" skips the browser's own short-term cache, so we stock the
      // shelves with genuinely fresh files.
      await cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' })));
      await self.skipWaiting();
    })(),
  );
});

// ACTIVATE: the new version takes over. Throw away old stock.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('repling-') && name !== SHELL_CACHE && name !== HEAVY_CACHE) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

async function fromCacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
  return response;
}

// Pages (the HTML) are fetched from the network first, so you always get
// the newest version when online. The cached copy is the offline fallback.
async function pageRequest(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    // "no-cache" means "always check with the server before trusting a
    // stored copy". Without it, the browser could hand back a page that is
    // up to 10 minutes old and points at files that no longer exist.
    const response = await fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' });
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (
      (await cache.match(request, { ignoreSearch: true })) ||
      (await cache.match('./')) ||
      new Response('Repling is offline and has not been saved on this phone yet.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' },
      })
    );
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE)) return;

  if (request.mode === 'navigate') {
    event.respondWith(pageRequest(request));
    return;
  }
  const path = url.pathname.slice(SCOPE.length);
  const heavy = path.startsWith('wasm/') || path.startsWith('models/');
  event.respondWith(
    fromCacheFirst(request, heavy ? HEAVY_CACHE : SHELL_CACHE).catch(() => Response.error()),
  );
});

// The app can ask us to fetch the tracking engine ahead of time.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'prefetch-heavy') return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(HEAVY_CACHE);
      for (const url of HEAVY) {
        try {
          if (await cache.match(url)) continue;
          const response = await fetch(url);
          if (response.ok) await cache.put(url, response);
        } catch {
          // No internet right now. It will be fetched on first use instead.
          return;
        }
      }
    })(),
  );
});
