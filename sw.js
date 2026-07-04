// ============================================================================
// Kachchh Kaarigari — Service Worker
// Strategy: Network-First, Cache-Fallback
//   - Always try the network first so live sheet data / fresh assets win.
//   - If the network fails (offline), fall back to whatever is cached.
//   - Core "app shell" assets are pre-cached on install so the PWA can still
//     open and render its baseline UI with zero connectivity.
// ============================================================================

const CACHE_NAME = 'kachchh-kaarigari-cache-v1';

// Core app shell — enough for the PWA to boot standalone offline.
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

// ----------------------------------------------------------------------------
// INSTALL: pre-cache the core app shell
// ----------------------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
      .catch((err) => console.error('[SW] Failed to pre-cache core assets:', err))
  );
});

// ----------------------------------------------------------------------------
// ACTIVATE: clean up any old cache versions
// ----------------------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// ----------------------------------------------------------------------------
// FETCH: Network-First, Cache-Fallback
// ----------------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  // Only handle GET requests — POST/PUT/etc. should always hit the network.
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Clone the response before it is consumed so we can store a copy.
        const responseClone = networkResponse.clone();

        // Only cache successful, basic (same-origin) or opaque responses.
        if (networkResponse && networkResponse.status === 200) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          }).catch((err) => {
            console.warn('[SW] Could not update cache for', event.request.url, err);
          });
        }

        return networkResponse;
      })
      .catch(() => {
        // Network failed (offline or unreachable) — serve from cache instead.
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }

          // Last resort for navigations: serve the cached app shell so the
          // PWA still opens instead of showing a browser error page.
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }

          return new Response(
            'Offline and no cached version of this resource is available.',
            { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/plain' } }
          );
        });
      })
  );
});
