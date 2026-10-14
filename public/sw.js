/* =========================================================================
   Service worker — lets the app open offline, without ever pinning visitors
   to an old version.

   The previous worker answered EVERY request cache-first, including the page
   itself, under a cache name that never changed. After a deploy, returning
   visitors got the old index.html, which asked for JavaScript files the new
   deploy had removed (404) — a blank page that never fixed itself.

   Rules now:
   - Pages (navigations): network first; the cached copy is only an offline
     fallback. A new deploy is picked up on the next load.
   - /assets/*: Vite fingerprints these (index-AbC123.js), so a given URL never
     changes — cache-first is safe and fast. Stored as they're fetched.
   - Everything else (API calls, Supabase, other sites): straight to network,
     never cached.
   - Bump VERSION on any change to this file's behaviour. Activating a new
     version deletes old caches and reloads any open tab that was running the
     old version — that is what rescues visitors stuck on a blank page.
   ========================================================================= */
const VERSION = "v3";
const CACHE = `byo-cache-${VERSION}`;
const SHELL = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // cache: "reload" bypasses the HTTP cache so the shell is the fresh deploy
      .then((cache) => cache.addAll(SHELL.map((u) => new Request(u, { cache: "reload" }))))
      .catch(() => {}) // offline install: carry on, pages still work online
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const stale = keys.filter((k) => k !== CACHE);
    await Promise.all(stale.map((k) => caches.delete(k)));
    await self.clients.claim();
    // Upgrading from an older worker: reload open tabs so anyone looking at a
    // blank page from the old cache gets the current site without doing
    // anything. Skipped on a first install (nothing stale) to avoid a reload.
    if (stale.length) {
      const tabs = await self.clients.matchAll({ type: "window" });
      await Promise.all(tabs.map((tab) => tab.navigate(tab.url).catch(() => {})));
    }
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Supabase, fonts, CDNs: not ours
  if (url.pathname.startsWith("/api/")) return;       // live data is never cached

  // Pages: network first, cached shell only when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("/", copy)); }
          return res;
        })
        .catch(() => caches.match("/").then((hit) => hit || Response.error()))
    );
    return;
  }

  // Fingerprinted build files: immutable, so cache-first is safe.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }

  // Icons and the manifest: network first, cache fallback offline.
  if (SHELL.includes(url.pathname)) {
    event.respondWith(fetch(req).catch(() => caches.match(req).then((hit) => hit || Response.error())));
  }
});
