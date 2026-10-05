/**
 * API client: attaches the Supabase JWT to every request and normalises
 * errors. All backend calls in the app go through here.
 */
import { supabase } from "@/lib/supabase";

const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:8000/api").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(status, detail) {
    super(detail || `Request failed (${status})`);
    this.status = status;
    this.detail = detail;
  }
}

/** Human-readable copy for the common failure modes, so users aren't shown raw HTTP text. */
const FRIENDLY = {
  0: "Couldn’t reach StudySpace. Check your connection and try again.",
  400: "That request wasn’t quite right.",
  401: "Your session expired. Please sign in again.",
  403: "You don’t have access to that.",
  404: "We couldn’t find that.",
  409: "That conflicts with something that already exists.",
  413: "That file is too large.",
  422: "Some of the details weren’t valid.",
  429: "You’re going a little fast — give it a moment and retry.",
  500: "StudySpace hit an internal error. Please try again.",
  502: "The server is restarting. Please try again in a moment.",
  503: "StudySpace is temporarily unavailable. Please try again.",
};

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

/**
 * Wraps a transport failure in an ApiError with status 0 so callers can treat
 * offline/DNS/socket errors the same way as HTTP errors.
 */
function toTransportError(err) {
  if (err instanceof ApiError) return err;
  if (err?.name === "AbortError") return err;
  return new ApiError(0, err?.message || "Network request failed");
}

/** Short, user-facing sentence for an ApiError. Falls back to the server detail. */
export function friendlyMessage(err) {
  if (!err) return "Something went wrong.";
  if (err.name === "AbortError") return "Request cancelled.";
  const status = err.status ?? 0;
  const detail = typeof err.detail === "string" ? err.detail.trim() : "";
  // Prefer an explicit server message, but don't surface HTML error pages.
  if (detail && detail.length < 200 && !/^</.test(detail)) return detail;
  return FRIENDLY[status] || "Something went wrong. Please try again.";
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch with bounded exponential backoff. Only safe/idempotent methods and
 * transient statuses are retried, and an aborted request never retries.
 */
async function fetchWithRetry(url, init, { retries = 2, method = "GET" } = {}) {
  const idempotent = method === "GET" || method === "HEAD";
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, init);
      if (res.ok || !RETRYABLE.has(res.status) || !idempotent || attempt === retries) {
        return res;
      }
      lastErr = new ApiError(res.status, res.statusText);
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      lastErr = toTransportError(err);
      if (!idempotent || attempt === retries) throw lastErr;
    }
    // 200ms, 400ms … capped, plus a little jitter so retries don't sync up.
    await sleep(Math.min(200 * 2 ** attempt, 2000) + Math.random() * 120);
  }
  throw lastErr || new ApiError(0, "Request failed");
}

export async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

async function request(path, { method = "GET", body, headers = {}, signal } = {}) {
  const token = await getToken();
  const init = {
    method,
    signal,
    headers: {
      Accept: "application/json",
      ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  };
  if (body !== undefined) {
    init.body = body instanceof FormData ? body : JSON.stringify(body);
  }
  let res;
  try {
    res = await fetchWithRetry(`${API_BASE}${path}`, init, { method });
  } catch (err) {
    throw toTransportError(err);
  }
  if (!res.ok) {
    let detail = null;
    try {
      const payload = await res.json();
      detail = typeof payload.detail === "string" ? payload.detail : JSON.stringify(payload.detail);
    } catch {
      detail = await res.text().catch(() => null);
    }
    throw new ApiError(res.status, detail || res.statusText);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  base: API_BASE,
  get: (path, opts) => request(path, opts),
  post: (path, body, opts) => request(path, { ...opts, method: "POST", body }),
  patch: (path, body, opts) => request(path, { ...opts, method: "PATCH", body }),
  delete: (path, opts) => request(path, { ...opts, method: "DELETE" }),
  upload: (path, formData, opts) => request(path, { ...opts, method: "POST", body: formData }),
};

/**
 * POST that consumes an SSE stream. `onEvent(event)` receives each parsed
 * JSON event; resolves when the stream ends. Used by chat (streaming answers).
 */
export async function streamSSE(path, body, onEvent, { signal } = {}) {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = null;
    try {
      const payload = await res.json();
      detail = payload.detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail || res.statusText);
  }
  const reader = res.body.getReader();  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          onEvent(JSON.parse(payload));
        } catch {
          /* skip malformed frame */
        }
      }
    }
  }
}
