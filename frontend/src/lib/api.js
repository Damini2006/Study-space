/**
 * API client: attaches the Supabase JWT to every request and normalises
 * errors. All backend calls in the app go through here.
 */
import { supabase } from "@/lib/supabase";
import { pickMessage, friendlyMessage } from "@/lib/errors";

export { friendlyMessage };

const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:8000/api").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(status, detail) {
    // `.message` is deliberately the user-facing copy — most call sites toast
    // `err.message` directly. The raw payload stays on `.detail`.
    super(pickMessage(status, detail));
    this.name = "ApiError";
    this.status = status;
    this.detail = detail ?? this.message;
  }
}

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
  await ensureOk(res);
  if (res.status === 204) return null;
  return res.json();
}

/** Map a failed response to an ApiError with the server's detail (shared by request/download). */
async function ensureOk(res) {
  if (res.ok) return;
  let detail = null;
  try {
    const payload = await res.json();
    detail = typeof payload.detail === "string" ? payload.detail : JSON.stringify(payload.detail);
  } catch {
    detail = await res.text().catch(() => null);
  }
  throw new ApiError(res.status, detail || res.statusText);
}

/** GET that returns the body as a Blob (file downloads); same auth/retries/errors as request(). */
async function download(path) {
  const token = await getToken();
  let res;
  try {
    res = await fetchWithRetry(
      `${API_BASE}${path}`,
      {
        method: "GET",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      },
      { method: "GET" }
    );
  } catch (err) {
    throw toTransportError(err);
  }
  await ensureOk(res);
  return res.blob();
}

export const api = {
  base: API_BASE,
  get: (path, opts) => request(path, opts),
  post: (path, body, opts) => request(path, { ...opts, method: "POST", body }),
  patch: (path, body, opts) => request(path, { ...opts, method: "PATCH", body }),
  delete: (path, opts) => request(path, { ...opts, method: "DELETE" }),
  upload: (path, formData, opts) => request(path, { ...opts, method: "POST", body: formData }),
  download: (path) => download(path),
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
