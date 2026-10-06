import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearQueue, enqueueReview, flushQueue, listQueuedReviews, queueSize } from "@/lib/offline-queue";

// The queue prefers IndexedDB but falls back to an in-memory array, so the
// behavioural tests below run identically without needing fake-indexeddb.
describe("offline review queue", () => {
  beforeEach(async () => {
    await clearQueue();
    vi.stubGlobal("indexedDB", undefined);
  });

  afterEach(async () => {
    await clearQueue();
    vi.unstubAllGlobals();
  });

  function entry(cardId, rating = 3) {
    return {
      card_id: cardId,
      rating,
      graded_at: new Date().toISOString(),
      duration_ms: 900,
    };
  }

  it("enqueues a review and reports the pending count", async () => {
    await enqueueReview(entry("card-1"));
    expect(await queueSize()).toBe(1);
  });

  it("gives each grade a stable idempotency key", async () => {
    // One entry, queued twice: the key has to come from the record, not from
    // the moment it happened to be built. (A freshly built entry would carry a
    // later `graded_at` and, as the test below asserts, a different key.)
    const review = entry("card-1");
    const a = await enqueueReview(review);
    const b = await enqueueReview(review);
    expect(a.key).toBe(b.key);
  });

  it("keys on the graded_at timestamp so a re-grade is a separate entry", async () => {
    const first = await enqueueReview({ ...entry("card-1"), graded_at: "2026-01-01T00:00:00Z" });
    const second = await enqueueReview({ ...entry("card-1"), graded_at: "2026-01-01T00:05:00Z" });
    expect(first.key).not.toBe(second.key);
    expect(await queueSize()).toBe(2);
  });

  it("removes an entry once it has been sent", async () => {
    const queued = await enqueueReview(entry("card-1"));
    await enqueueReview(entry("card-2"));
    expect(await queueSize()).toBe(2);

    const { flushed, remaining } = await flushQueue(async () => {});
    expect(flushed).toBe(2);
    expect(remaining).toBe(0);
    expect((await listQueuedReviews()).some((r) => r.key === queued.key)).toBe(false);
  });

  it("stops flushing at the first network failure and keeps the rest queued", async () => {
    await enqueueReview(entry("card-1"));
    await enqueueReview(entry("card-2"));
    await enqueueReview(entry("card-3"));

    let calls = 0;
    const { flushed, remaining } = await flushQueue(async () => {
      calls += 1;
      if (calls === 2) {
        const err = new Error("offline");
        err.status = 0;
        throw err;
      }
    });

    expect(flushed).toBe(1);
    expect(remaining).toBe(2);
  });

  it("drops a permanently rejected entry instead of blocking the queue", async () => {
    await enqueueReview(entry("deleted-card"));
    await enqueueReview(entry("good-card"));

    const { flushed, remaining } = await flushQueue(async (e) => {
      if (e.card_id === "deleted-card") {
        const err = new Error("not found");
        err.status = 404;
        throw err;
      }
    });

    // The bad entry is discarded, the good one still goes through.
    expect(flushed).toBe(1);
    expect(remaining).toBe(0);
  });

  it("preserves FIFO order across a partial flush", async () => {
    await enqueueReview(entry("card-1"));
    await enqueueReview(entry("card-2"));

    const sent = [];
    await flushQueue(async (e) => {
      sent.push(e.card_id);
      if (e.card_id === "card-1") {
        const err = new Error("offline");
        err.status = 0;
        throw err;
      }
    });
    expect(sent).toEqual(["card-1"]);
  });

  it("clearQueue empties everything", async () => {
    await enqueueReview(entry("card-1"));
    await enqueueReview(entry("card-2"));
    await clearQueue();
    expect(await queueSize()).toBe(0);
  });
});