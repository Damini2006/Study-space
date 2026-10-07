/**
 * Global error capture: what the browser saw, delivered to the backend's
 * POST /api/client-errors — anonymous, scrubbed again on arrival, and read
 * back as one correlated log line (see studyspace/routers/client_errors.py).
 *
 * Three rules keep it safe to run on every page:
 *
 * 1. Consent first. Nothing is sent until the cookie banner was accepted.
 *    This is first-party functional telemetry rather than ad tracking, but
 *    the banner is where the user gets to answer, and "decline" or no
 *    answer both mean no.
 * 2. Never throws. The reporter failing must not become the second error
 *    the reporter reports: every path is wrapped, the fetch swallows its
 *    own rejection, and no caller ever receives a promise to forget.
 * 3. Bounded. The same message inside 30 seconds is a repeat, and a page
 *    that is on fire gets ten reports rather than ten thousand — the
 *    server's per-IP rate limit is the backstop; this is the front door.
 */
import { api } from "@/lib/api";

const CONSENT_KEY = "studyspace.cookieConsent";
const MAX_REPORTS = 10;
const DEDUPE_WINDOW_MS = 30_000;

// Mirrors of the server's soft caps: agree before sending, and let the
// server keep the authoritative copy.
const MESSAGE_CAP = 500;
const STACK_CAP = 4000;
const ROUTE_CAP = 200;

// The same two shapes the server scrubs. Belt and braces: the wire should
// not carry a token even to an endpoint that would refuse to log it.
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g;
const BEARER = /bearer\s+[A-Za-z0-9._~+/=-]+/gi;

let installed = false;
let onError = null;
let onRejection = null;
let sent = 0;
let lastMessage = "";
let lastAt = 0;

function consented() {
  try {
    return localStorage.getItem(CONSENT_KEY) === "accepted";
  } catch {
    // Private browsing: no stored answer, so no sending.
    return false;
  }
}

function scrub(text) {
  return text.replace(JWT, "[redacted-jwt]").replace(BEARER, "Bearer [redacted]");
}

function send({ message, stack, source }) {
  if (!consented()) return;
  if (sent >= MAX_REPORTS) return;
  const now = Date.now();
  if (message === lastMessage && now - lastAt < DEDUPE_WINDOW_MS) return;
  lastMessage = message;
  lastAt = now;
  sent += 1;

  try {
    fetch(`${api.base}/client-errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Survives the page going away, which is exactly when a crash report
      // matters most.
      keepalive: true,
      body: JSON.stringify({
        message: scrub(String(message ?? "")).slice(0, MESSAGE_CAP),
        stack: stack ? scrub(String(stack)).slice(0, STACK_CAP) : null,
        route: scrub(window.location.pathname || "/").slice(0, ROUTE_CAP),
        source,
      }),
    }).catch(() => {
      // A report that cannot be delivered is not worth reporting.
    });
  } catch {
    // Nothing above should throw; if it ever does, the page must not care.
  }
}

export function reportClientError({ message, stack = null, source }) {
  send({ message, stack, source });
}

/**
 * Listen for uncaught errors and rejections. Idempotent: calling it twice
 * attaches one pair of listeners, not two.
 */
export function installGlobalErrorCapture() {
  if (installed) return;
  installed = true;

  onError = (event) => {
    // Resource load errors carry no message and no error object; a script
    // crash carries one of the two.
    if (!event.message && !event.error) return;
    try {
      reportClientError({
        message: event.message || String(event.error),
        stack: event.error?.stack ?? null,
        source: "uncaught",
      });
    } catch {
      /* the reporter reports errors; it must not have one of its own */
    }
  };

  onRejection = (event) => {
    try {
      const reason = event.reason;
      reportClientError({
        message: reason?.message ?? String(reason),
        stack: reason?.stack ?? null,
        source: "rejection",
      });
    } catch {
      /* as above */
    }
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
}

/**
 * Detach the listeners and start the page's error budget over. Tests call
 * it between cases so each begins clean; anything that tears the page down
 * without a reload could use it too.
 */
export function resetClientErrorCapture() {
  if (onError) window.removeEventListener("error", onError);
  if (onRejection) window.removeEventListener("unhandledrejection", onRejection);
  onError = null;
  onRejection = null;
  installed = false;
  sent = 0;
  lastMessage = "";
  lastAt = 0;
}
