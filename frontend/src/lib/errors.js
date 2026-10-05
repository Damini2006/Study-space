/**
 * User-facing copy for failed requests. Kept in its own module (no supabase or
 * fetch dependencies) so UI layers like toasts can import it cheaply.
 */

/** Human-readable copy for the common failure modes, so users aren't shown raw HTTP text. */
export const FRIENDLY = {
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

export const FALLBACK_MESSAGE = "Something went wrong. Please try again.";

/**
 * Pick the copy shown to the user: an explicit server message wins, unless it
 * looks like an HTML error page or is long enough to be unreadable in a toast.
 */
export function pickMessage(status, detail) {
  const d = typeof detail === "string" ? detail.trim() : "";
  if (d && d.length < 200 && !/^</.test(d)) return d;
  return FRIENDLY[status] || FALLBACK_MESSAGE;
}

/**
 * Normalise any thrown value — Error, ApiError-shaped object, or plain
 * message — into a single sentence safe to show in a toast.
 */
export function friendlyMessage(err) {
  if (!err) return FALLBACK_MESSAGE;
  if (typeof err === "string") return err || FALLBACK_MESSAGE;
  if (err.name === "AbortError") return "Request cancelled.";
  if (typeof err.status === "number") return pickMessage(err.status, err.detail ?? err.message);
  return err.message || FALLBACK_MESSAGE;
}
