/**
 * Offline review queue.
 *
 * FSRS review grading must survive a dropped connection — a student on a train
 * still grades cards, and losing those grades silently corrupts their
 * scheduling interval. So every review is written to IndexedDB first and
 * replayed to the API when the network allows. The queue is idempotent per
 * (cardId, gradedAt) so a retry can never double-apply a grade.
 */

const DB_NAME = "studyspace-offline";
const DB_VERSION = 1;
const STORE = "review-queue";
const META = "meta";

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "key" });
        store.createIndex("queuedAt", "queuedAt");
      }
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db, store, mode, run) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const result = run(transaction.objectStore(store));
    transaction.oncomplete = () => resolve(result?.result ?? result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

/** Stable per-grade key so replays are idempotent. */
function entryKey(entry) {
  return `${entry.card_id}@${entry.graded_at}`;
}

export async function enqueueReview(entry) {
  const record = {
    ...entry,
    key: entryKey(entry),
    queuedAt: Date.now(),
    attempts: 0,
  };
  try {
    const db = await openDb();
    await tx(db, STORE, "readwrite", (store) => store.put(record));
    await registerBackgroundSync();
    return record;
  } catch {
    // No IndexedDB (private mode, unsupported browser) — fall back to memory so
    // the in-session queue still works, just not across reloads.
    memoryQueue.push(record);
    return record;
  }
}

/** In-memory fallback used when IndexedDB is unavailable. */
const memoryQueue = [];

export async function listQueuedReviews() {
  try {
    const db = await openDb();
    const out = await tx(db, STORE, "readonly", (store) => store.getAll());
    return [...memoryQueue, ...(out ?? [])].sort((a, b) => a.queuedAt - b.queuedAt);
  } catch {
    return [...memoryQueue];
  }
}

export async function queueSize() {
  const all = await listQueuedReviews();
  return all.length;
}

export async function removeQueuedReview(key) {
  const inMemory = memoryQueue.findIndex((r) => r.key === key);
  if (inMemory !== -1) memoryQueue.splice(inMemory, 1);
  try {
    const db = await openDb();
    await tx(db, STORE, "readwrite", (store) => store.delete(key));
  } catch {
    /* nothing else to do — memory copy already dropped */
  }
}

export async function clearQueue() {
  memoryQueue.length = 0;
  try {
    const db = await openDb();
    await tx(db, STORE, "readwrite", (store) => store.clear());
  } catch {
    /* ignore */
  }
}

export async function markAttempt(key) {
  try {
    const db = await openDb();
    const record = await tx(db, STORE, "readwrite", (store) => store.get(key));
    if (record) {
      record.attempts = (record.attempts ?? 0) + 1;
      record.lastAttemptAt = Date.now();
      await tx(db, STORE, "readwrite", (store) => store.put(record));
    }
  } catch {
    /* ignore */
  }
}

/**
 * Ask the browser to wake us when connectivity returns. Chrome supports this;
 * elsewhere `flushQueue` still runs on the app's own online/focus listeners.
 */
export async function registerBackgroundSync() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg?.sync) await reg.sync.register("studyspace-review-sync");
  } catch {
    /* Background Sync unavailable — foreground flush handles it. */
  }
}

/**
 * Replay queued reviews. Stops at the first network failure so ordering is
 * preserved — FSRS grades are order-independent, but keeping the FIFO order
 * makes debugging a partial flush tractable.
 *
 * @param {(entry: object) => Promise<void>} send posts one grade
 * @returns {Promise<{flushed: number, remaining: number}>}
 */
export async function flushQueue(send) {
  const queued = await listQueuedReviews();
  let flushed = 0;
  for (const entry of queued) {
    try {
      await send(entry);
      await removeQueuedReview(entry.key);
      flushed += 1;
    } catch (err) {
      await markAttempt(entry.key);
      // Offline or server error — stop and leave the rest queued.
      if (err?.status === 0 || err?.name === "TypeError" || err?.status >= 500) break;
      // A 4xx means the payload is rejected (e.g. the card was deleted); drop it
      // rather than blocking the queue forever.
      if (err?.status >= 400 && err?.status < 500) {
        await removeQueuedReview(entry.key);
        continue;
      }
      break;
    }
  }
  const remaining = (await listQueuedReviews()).length;
  return { flushed, remaining };
}