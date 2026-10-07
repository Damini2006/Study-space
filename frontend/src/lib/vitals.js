/**
 * Real-user performance: FCP, LCP and CLS for the first load, sent once
 * to POST /api/vitals. The backend logs one line and keeps nothing else —
 * the log drain is the store — so this is field data without a field
 * data pipeline to build first.
 *
 * Design notes worth keeping:
 *
 * - One snapshot per page load, taken after load and a moment of idle so
 *   the act of measuring cannot itself become a measurement. Observers
 *   disconnect right after: later LCP updates describe a page the user
 *   has already started using, not the first paint they judged it by.
 * - Consent: accepted → sent now; not yet answered → held until the
 *   banner decides (a first-time visitor's first load is exactly the
 *   cold-cache data worth waiting for); declined → dropped.
 * - No INP here on purpose. Honest INP needs event-timing aggregation
 *   across interactions, and a hand-rolled version would produce numbers
 *   that look authoritative and aren't. FCP, LCP and CLS are entries
 *   where hand-rolling is straightforward.
 * - Never throws, same rule as the crash reporter: this measures the
 *   page, it must not be the thing that breaks it.
 */
import { api } from "@/lib/api";

const CONSENT_KEY = "studyspace.cookieConsent";
const CONSENT_EVENT = "studyspace:consent";
const IDLE_TIMEOUT_MS = 3000;

let generation = 0;
let inited = false;
let sent = false;
let pending = null;

function consented() {
  try {
    return localStorage.getItem(CONSENT_KEY) === "accepted";
  } catch {
    return false;
  }
}

function schedule(run) {
  const idle = () => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
    } else {
      setTimeout(run, 1000);
    }
  };
  if (document.readyState === "complete") idle();
  else window.addEventListener("load", idle, { once: true });
}

export function initVitalsReporting() {
  if (inited || typeof PerformanceObserver === "undefined") return;
  inited = true;
  const epoch = generation;

  let fcp = null;
  let lcp = null;
  let cls = 0;
  const observers = [];

  try {
    const paint = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === "first-contentful-paint") fcp = entry.startTime;
      }
    });
    paint.observe({ type: "paint", buffered: true });
    observers.push(paint);

    const largest = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) lcp = last.renderTime || last.startTime;
    });
    largest.observe({ type: "largest-contentful-paint", buffered: true });
    observers.push(largest);

    const shifts = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) cls += entry.value;
      }
    });
    shifts.observe({ type: "layout-shift", buffered: true });
    observers.push(shifts);
  } catch {
    // Observer types vary by browser; anything unobservable reports as
    // null, which the log prints as `none` — also information.
  }

  schedule(() => {
    // A stale timer from a torn-down instance must not fire into a fresh one.
    if (epoch !== generation || sent) return;
    sent = true;
    const payload = {
      fcp_ms: fcp === null ? null : Math.round(fcp),
      lcp_ms: lcp === null ? null : Math.round(lcp),
      cls: Math.round(cls * 1000) / 1000,
      route: window.location.pathname || "/",
    };
    for (const observer of observers) {
      try {
        observer.disconnect();
      } catch {
        // A browser with no disconnect is a browser that will collect
        // the observer itself.
      }
    }
    deliver(payload);
  });
}

function deliver(payload) {
  if (consented()) {
    post(payload);
    return;
  }
  // Hold the first load until the banner answers: for a first-time
  // visitor the cold-cache load is the one worth measuring, and it
  // lands before they have decided anything.
  pending = payload;
  window.addEventListener(CONSENT_EVENT, onConsent, { once: true });
}

function onConsent(event) {
  const held = pending;
  pending = null;
  // The event carries the answer, because storage may be exactly what
  // is unavailable in the browser that just clicked.
  if (held && event?.detail === "accepted") post(held);
}

function post(payload) {
  try {
    fetch(`${api.base}/vitals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify(payload),
    }).catch(() => {
      // A vitals report that cannot be delivered is not worth a word.
    });
  } catch {
    // Never throws — this measures the page, it must not break it.
  }
}

/**
 * Detach the consent listener and start over. Tests call it between
 * cases so each begins with a clean page.
 */
export function resetVitalsReporting() {
  generation += 1;
  inited = false;
  sent = false;
  pending = null;
  window.removeEventListener(CONSENT_EVENT, onConsent);
}
