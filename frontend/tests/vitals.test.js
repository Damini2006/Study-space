import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initVitalsReporting, resetVitalsReporting } from "@/lib/vitals";
import { api } from "@/lib/api";

const CONSENT_KEY = "studyspace.cookieConsent";
const CONSENT_EVENT = "studyspace:consent";

let fetchMock;

class FakePerformanceObserver {
  constructor(callback) {
    this.callback = callback;
    this.options = null;
    this.disconnected = false;
    FakePerformanceObserver.instances.push(this);
  }

  observe(options) {
    this.options = options;
  }

  disconnect() {
    this.disconnected = true;
  }

  emit(entries) {
    // Real observers stop reporting once disconnected.
    if (this.disconnected) return;
    this.callback({ getEntries: () => entries });
  }
}
FakePerformanceObserver.instances = [];

function observerFor(type) {
  return FakePerformanceObserver.instances.find((entry) => entry.options?.type === type);
}

function answerBanner(value) {
  localStorage.setItem(CONSENT_KEY, value);
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value }));
}

function start() {
  initVitalsReporting();
  // Harmless when the document is already complete; the other half of
  // schedule()'s contract when it is not.
  window.dispatchEvent(new Event("load"));
}

async function settle() {
  // requestIdleCallback does not exist under jsdom, so schedule() used
  // the setTimeout(1000) path — the fake timer to advance.
  await vi.advanceTimersByTimeAsync(1100);
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("PerformanceObserver", FakePerformanceObserver);
  FakePerformanceObserver.instances = [];
  localStorage.clear();
  resetVitalsReporting();
});

afterEach(() => {
  resetVitalsReporting();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("vitals reporting", () => {
  it("sends FCP, LCP and CLS once the first load has settled", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    start();

    observerFor("paint").emit([
      { name: "first-contentful-paint", startTime: 604.8 },
      { name: "non-contentful-paint", startTime: 700 },
    ]);
    observerFor("largest-contentful-paint").emit([{ startTime: 900.4 }]);
    observerFor("layout-shift").emit([
      { value: 0.02, hadRecentInput: false },
      { value: 0.5, hadRecentInput: true }, // shifts near input are not instability
    ]);
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${api.base}/vitals`);
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body)).toEqual({
      fcp_ms: 605,
      lcp_ms: 900,
      cls: 0.02,
      route: window.location.pathname,
    });
  });

  it("holds the first load until the banner answers, then sends it", async () => {
    start();
    observerFor("paint").emit([
      { name: "first-contentful-paint", startTime: 604.8 },
    ]);
    await settle();

    // No consent yet — a first-time visitor still reading the banner.
    expect(fetchMock).not.toHaveBeenCalled();

    answerBanner("accepted");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).fcp_ms).toBe(605);
  });

  it("drops the held snapshot when the banner is declined", async () => {
    start();
    observerFor("paint").emit([
      { name: "first-contentful-paint", startTime: 604.8 },
    ]);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();

    answerBanner("declined");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("takes one snapshot, then lets the observers go", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    start();
    observerFor("paint").emit([
      { name: "first-contentful-paint", startTime: 100 },
    ]);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(observerFor("paint").disconnected).toBe(true);

    // Later entries describe a page the user is already using, and a
    // disconnected observer never delivers them anyway.
    observerFor("paint").emit([
      { name: "first-contentful-paint", startTime: 200 },
    ]);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the browser has no PerformanceObserver", async () => {
    // Consent present, timers settled: without the guard this would
    // schedule, take an all-null snapshot, and post it anyway.
    localStorage.setItem(CONSENT_KEY, "accepted");
    vi.stubGlobal("PerformanceObserver", undefined);
    expect(() => start()).not.toThrow();
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("survives its own transport failing", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    fetchMock.mockRejectedValue(new Error("offline"));
    start();
    await settle();

    // The rejected fetch never became an unhandled rejection — vitest
    // would have failed the test — and the snapshot still went out once.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
