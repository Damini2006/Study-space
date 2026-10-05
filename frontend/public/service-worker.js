/*
 * StudySpace service worker.
 *
 * Responsibilities, in priority order:
 *   1. Precache the app shell so a cold offline launch still renders.
 *   2. Serve hashed build assets cache-first (they're immutable).
 *   3. Serve navigations network-first with a cached shell fallback.
 *   4. Replay the offline review queue on background sync, so FSRS grades taken
 *      without a connection are never lost.
 *   5. Show a review-due notification at the moment a card becomes due.
 *
 * Deliberately NOT cached: chat requests and anything mutating. Replaying a
 * stale chat answer would be worse than showing nothing.
 */

const VERSION = "v1";
const SHELL_CACHE = `studyspace-shell-${VERSION}`;
const ASSET_CACHE = `studyspace-assets-${VERSION}`;

const SHELL_URLS = [
  "/",
  "/manifest.json",
  "/favicon.svg",
  "/logo-mark.svg",
  "/logo-full.svg",
];

const OFFLINE_DOC = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>StudySpace — offline</title>
    <style>
      body {
        margin: 0; min-height: 100vh; display: grid; place-items: center;
        font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
        background: #0d1526; color: #e8ecf5;
      }
      main { max-width: 22rem; padding: 2rem; text-align: center; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #9aa6bd; line-height: 1.5; margin: 0 0 1.5rem; }
      a {
        display: inline-block; padding: 0.6rem 1.2rem; border-radius: 0.5rem;
        background: #2b3a5c; color: #e8ecf5; text-decoration: none; font-size: 0.9rem;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>You're offline</h1>
      <p>
        Anything you already opened still works, and reviews you grade are saved
        and sent when you reconnect.
      </p>
      <a href="/">Open StudySpace</a>
    </main>
  </body>
</html>`;

const offlineResponse = () =>
  new Response(OFFLINE_DOC, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Individually so one 404 can't abort the whole precache.
      await Promise.allSettled(SHELL_URLS.map((url) => cache.add(url)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("studyspace-") && !k.endsWith(VERSION))
          .map((k) => caches.delete(k))
      );
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

function isHashedAsset(url) {
  return url.pathname.startsWith("/assets/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // The API lives on a different origin in dev; never touch it from the SW.
  if (url.origin !== self.location.origin) return;
  // A cross-origin guard for navigations so an embedded iframe can't be
  // hijacked into the app shell.
  if (request.mode === "navigate" && url.pathname.startsWith("/api/")) return;

  // Hashed build output — safe to serve cache-first forever.
  if (isHashedAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Navigations — network-first, fall back to the cached shell then the
  // offline document. Every SPA route resolves to the same shell.
  if (request.mode === "navigate") {
    // Grab the preload response immediately — it only resolves once, and
    // awaiting it later would silently fall back to a second network request.
    const preload = event.preloadResponse
      ? Promise.resolve(event.preloadResponse).catch(() => null)
      : Promise.resolve(null);
    event.respondWith(networkFirstShell(request, preload));
    return;
  }

  // Same-origin images/manifest — stale-while-revalidate.
  if (/\.(png|svg|jpg|jpeg|webp|ico|webmanifest|json)$/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    return Response.error();
  }
}

async function networkFirstShell(request, preloadPromise) {
  const shell = await caches.open(SHELL_CACHE);
  try {
    const preload = preloadPromise ? await preloadPromise : null;
    const res = preload ?? (await fetch(request));
    if (res && res.ok) shell.put("/", res.clone());
    return res;
  } catch {
    return (await shell.match("/")) ?? offlineResponse();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return hit ?? (await network) ?? Response.error();
}

/* ------------------------------------------------------------------ *
 * Offline review queue replay
 * ------------------------------------------------------------------ */

self.addEventListener("sync", (event) => {
  if (event.tag === "studyspace-review-sync") {
    event.waitUntil(flushReviewQueue());
  }
});

async function readQueued() {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("review-queue", "readonly");
    const req = tx.objectStore("review-queue").getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

async function deleteQueued(key) {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("review-queue", "readwrite");
    tx.objectStore("review-queue").delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function openQueueDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("studyspace-offline", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("review-queue")) {
        const store = db.createObjectStore("review-queue", { keyPath: "key" });
        store.createIndex("queuedAt", "queuedAt");
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Replay queued grades. The SW can't reach Supabase's session directly, so it
 * posts through the API origin using a token the page handed it via
 * `SET_AUTH_TOKEN`; without one we bail and let the foreground flush handle it.
 */
async function flushReviewQueue() {
  const apiBase = self.__studyspaceApiBase;
  const token = self.__studyspaceToken;
  if (!apiBase || !token) return;

  let queued = [];
  try {
    queued = await readQueued();
  } catch {
    return;
  }
  if (!queued.length) return;

  for (const entry of queued) {
    try {
      const res = await fetch(`${apiBase}/study/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          card_id: entry.card_id,
          rating: entry.rating,
          reviewed_at: entry.graded_at,
          duration_ms: entry.duration_ms,
        }),
      });
      if (res.ok) {
        await deleteQueued(entry.key);
        continue;
      }
      // A rejected payload (deleted card) will never succeed — drop it so it
      // doesn't block the rest of the queue.
      if (res.status >= 400 && res.status < 500) {
        await deleteQueued(entry.key);
        continue;
      }
      break; // server error — retry on the next sync
    } catch {
      break; // still offline
    }
  }

  const remaining = await readQueued().catch(() => []);
  if (remaining.length === 0) {
    await notifyClients({ type: "REVIEW_QUEUE_FLUSHED" });
  } else {
    await notifyClients({ type: "REVIEW_QUEUE_PENDING", count: remaining.length });
  }
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
  clients.forEach((c) => c.postMessage(message));
}

/* ------------------------------------------------------------------ *
 * Push notifications (FSRS due reminders)
 * ------------------------------------------------------------------ */

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text() };
  }

  const title = payload.title || "Cards due";
  const options = {
    body: payload.body || "You have flashcards ready for review.",
    icon: "/logo-mark.svg",
    badge: "/logo-mark.svg",
    tag: payload.tag || "studyspace-review-due",
    renotify: true,
    data: { url: payload.url || "/app/study" },
    actions: [
      { action: "review", title: "Review now" },
      { action: "snooze", title: "Later" },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/app/study";
  if (event.action === "snooze") return;

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = all.find((c) => new URL(c.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        existing.navigate?.(target);
        return;
      }
      await self.clients.openWindow(target);
    })()
  );
});