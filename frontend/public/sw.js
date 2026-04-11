/// <reference lib="webworker" />

/**
 * PROPMETRIK Service Worker
 * Provides offline capability, caching, and push notifications
 * Phase 5.12: Advanced Analytics & Mobile
 */

/* eslint-disable no-restricted-globals */

// Service Worker globals
const selfSW = self;

const CACHE_NAME = 'propmetrik-v3';
const STATIC_CACHE = 'propmetrik-static-v3';
const DYNAMIC_CACHE = 'propmetrik-dynamic-v3';
const API_CACHE = 'propmetrik-api-v3';

// Static assets to cache on install
// NOTE: Do NOT cache auth-protected routes (e.g. /dashboard/*) here.
// They return redirects when unauthenticated, and cached redirects cause
// ERR_FAILED ("redirect mode is not follow") on subsequent navigation.
const STATIC_ASSETS = [
  '/',
  '/offline',
  '/manifest.json',
];

// API routes to cache (with network-first strategy)
const CACHEABLE_API_ROUTES = [
  '/api/crm/pipelines',
  '/api/crm/contacts',
  '/api/valuations',
  '/api/analytics/dashboard',
  // PM API routes
  '/api/projects',
  '/api/bid-requests',
  '/api/team/members',
  '/api/drawings',
  '/api/transmittals',
  '/api/esign/envelopes',
  '/api/v1/projects',
  '/api/v1/transmittals',
  '/api/v1/drawings',
  '/api/v1/esign/envelopes',
];

// Install event - cache static assets
selfSW.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      console.log('[SW] Caching static assets');
      // Cache each asset individually so a single 404 doesn't break the whole install
      for (const url of STATIC_ASSETS) {
        try {
          await cache.add(url);
        } catch (err) {
          console.warn('[SW] Failed to cache:', url, err.message || err);
        }
      }
    })
  );

  // Activate immediately
  selfSW.skipWaiting();
});

// Activate event - clean up old caches
selfSW.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => {
            return name !== STATIC_CACHE &&
              name !== DYNAMIC_CACHE &&
              name !== API_CACHE &&
              name !== CACHE_NAME;
          })
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );

  // Take control immediately
  selfSW.clients.claim();
});

// Fetch event - serve from cache or network
selfSW.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension and other schemes
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Skip Next.js internals, SSE/realtime, and auth routes — let the browser handle them natively.
  // Intercepting these causes ERR_FAILED errors and stale responses.
  if (
    url.pathname.startsWith('/_next/') ||
    url.pathname.includes('/realtime/') ||
    url.pathname.startsWith('/api/auth/')
  ) {
    return;
  }

  // API requests - Network first, then cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // Navigation requests (page loads) - Network first to avoid cached redirects
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // Static assets (JS, CSS, images) - Cache first, then network
  event.respondWith(cacheFirstStrategy(request));
});

// Cache-first strategy
async function cacheFirstStrategy(request) {
  const cached = await caches.match(request);
  if (cached) {
    // Update cache in background
    fetchAndCache(request, DYNAMIC_CACHE);
    return cached;
  }

  try {
    const response = await fetch(request);

    // Cache successful responses
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      const offlinePage = await caches.match('/offline');
      if (offlinePage) return offlinePage;
    }

    // For non-navigation requests (JS, CSS, images), propagate the network
    // error instead of returning a synthetic 503. Returning a fake response
    // with the wrong content-type causes cascading console errors.
    throw error;
  }
}

// Network-first strategy
async function networkFirstStrategy(request) {
  try {
    const response = await fetch(request);

    // Cache successful API responses
    if (response.ok && shouldCacheApiRoute(request.url)) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    // Try to serve from cache
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }

    // Return offline JSON response for API
    return new Response(
      JSON.stringify({
        error: 'Offline',
        message: 'You are offline. Please try again when connected.',
        offline: true
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// Background fetch and cache
async function fetchAndCache(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response);
    }
  } catch (error) {
    // Ignore fetch errors in background
  }
}

// Check if API route should be cached
function shouldCacheApiRoute(url) {
  return CACHEABLE_API_ROUTES.some((route) => url.includes(route));
}

// Push notification event
selfSW.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');

  let data = {
    title: 'PROPMETRIK',
    body: 'You have a new notification',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    tag: 'propmetrik-notification',
    data: { url: '/dashboard' }
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    selfSW.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      tag: data.tag,
      data: data.data,
      vibrate: [100, 50, 100],
      actions: [
        { action: 'open', title: 'View' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    })
  );
});

// Notification click event
selfSW.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked');

  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/dashboard';

  if (event.action === 'dismiss') {
    return;
  }

  event.waitUntil(
    selfSW.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Check if there's already a window open
      for (const client of clients) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }

      // Open new window
      return selfSW.clients.openWindow(urlToOpen);
    })
  );
});

// Background sync event
selfSW.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);

  if (event.tag === 'sync-offline-data') {
    event.waitUntil(syncOfflineData());
  }
});

// Sync offline data
async function syncOfflineData() {
  try {
    // Get pending offline operations from IndexedDB
    const db = await openOfflineDB();
    const tx = db.transaction('pendingOperations', 'readonly');
    const store = tx.objectStore('pendingOperations');
    const operations = await getAllFromStore(store);

    for (const op of operations) {
      try {
        await fetch(op.url, {
          method: op.method,
          headers: op.headers,
          body: op.body
        });

        // Remove successful operation
        const deleteTx = db.transaction('pendingOperations', 'readwrite');
        const deleteStore = deleteTx.objectStore('pendingOperations');
        deleteStore.delete(op.id);
      } catch (error) {
        console.log('[SW] Failed to sync operation:', op.id);
      }
    }
  } catch (error) {
    console.error('[SW] Sync failed:', error);
  }
}

// IndexedDB helpers
function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('propmetrik-offline', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pendingOperations')) {
        db.createObjectStore('pendingOperations', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

function getAllFromStore(store) {
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

// Periodic background sync (if supported)
selfSW.addEventListener('periodicsync', (event) => {
  if (event.tag === 'refresh-data') {
    event.waitUntil(refreshCachedData());
  }
});

// Refresh cached data
async function refreshCachedData() {
  const cache = await caches.open(API_CACHE);

  for (const route of CACHEABLE_API_ROUTES) {
    try {
      const response = await fetch(route);
      if (response.ok) {
        cache.put(route, response);
      }
    } catch (error) {
      // Ignore errors
    }
  }
}
