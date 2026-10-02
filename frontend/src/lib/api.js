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
  const res = await fetch(`${API_BASE}${path}`, init);
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
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
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
