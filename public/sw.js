const CACHE = "zan-crm-v1";
const OFFLINE_URL = "/offline.html";

// Take control immediately on install/activate
self.addEventListener("install", (event) => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE);
            await cache.add(OFFLINE_URL);
            await self.skipWaiting();
        })()
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        (async () => {
            // Clean up old caches if you bump the version above
            const keys = await caches.keys();
            await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
            await self.clients.claim();
        })()
    );
});

self.addEventListener("fetch", (event) => {
    const { request } = event;

    // Only handle GET; let the browser deal with POST/PUT/etc. normally
    if (request.method !== "GET") return;

    const url = new URL(request.url);

    // Never cache API calls — a CRM must always show fresh data
    if (url.pathname.startsWith("/api/")) return;

    // Page navigations: try network first, fall back to cache if offline
    if (request.mode === "navigate") {
        event.respondWith(
            (async () => {
                try {
                    return await fetch(request);
                } catch {
                    const cached = await caches.match(request);
                    return cached || (await caches.match(OFFLINE_URL));
                }
            })()
        );
        return;
    }

    // Static assets (JS, CSS, images): serve from cache, update in background
    event.respondWith(
        (async () => {
            const cached = await caches.match(request);
            const network = fetch(request)
                .then((res) => {
                    const copy = res.clone();
                    caches.open(CACHE).then((c) => c.put(request, copy));
                    return res;
                })
                .catch(() => cached);
            return cached || network;
        })()
    );
});