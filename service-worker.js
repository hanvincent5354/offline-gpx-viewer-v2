const CACHE_NAME = 'trailnav-cache-v2';
const TILE_CACHE_NAME = 'trailnav-tiles-v1';

// Core assets to pre-cache for offline startup
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
];

// Install Service Worker and cache static shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching static assets');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Service Worker and clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== TILE_CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Interceptor: Caches static assets & automatically caches loaded map tiles
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Intercept OpenStreetMap map tile requests
  if (url.hostname.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.open(TILE_CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          // If tile is in cache, return it immediately (Cache-First)
          if (cachedResponse) {
            return cachedResponse;
          }

          // If tile is not in cache, fetch it from network, cache it, and return it
          return fetch(event.request).then((networkResponse) => {
            if (networkResponse.status === 200) {
              // Cache must store a clone of the response
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          }).catch((err) => {
            console.warn('[Service Worker] Network fail for map tile, and not in cache:', url.pathname);
            // Return an empty transparent 1x1 image or default error offline tile
            return new Response(
              'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="%231e293b"/><text x="50%" y="50%" fill="%2364748b" font-family="sans-serif" font-size="14" dominant-baseline="middle" text-anchor="middle">Offline (Tile Not Cached)</text></svg>',
              { headers: { 'Content-Type': 'image/svg+xml' } }
            );
          });
        });
      })
    );
    return;
  }

  // 2. Intercept static UI assets and libraries (Cache-First, fallback to network)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        // Automatically cache files in the same origin if they are fetched
        if (url.origin === self.location.origin && networkResponse.status === 200) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkResponse.clone());
          });
        }
        return networkResponse;
      }).catch(() => {
        // Fallback for document navigation if offline
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
