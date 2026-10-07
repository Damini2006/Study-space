import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { friendlyMessage } from "@/lib/errors";

const ToastContext = createContext(null);
let idCounter = 0;

/**
 * Accepts a plain string or an Error. Errors are run through the API client's
 * friendly copy so users never see a raw status line in a toast.
 */
function toText(message) {
  if (typeof message === "string") return message;
  if (message instanceof Error) return friendlyMessage(message);
  return String(message ?? "");
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message, { variant = "default", duration = 4000 } = {}) => {
      const id = ++idCounter;
      const text = toText(message);
      setToasts((list) => [...list.slice(-3), { id, message: text, variant, duration }]);
      if (duration > 0) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      toast: push,
      success: (m, o) => push(m, { ...o, variant: "success" }),
      error: (m, o) => push(m, { ...o, variant: "danger", duration: 6000 }),
      info: (m, o) => push(m, { ...o, variant: "info" }),
      dismiss,
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2"
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className={cn(
                "pointer-events-auto relative flex items-start gap-2 rounded-lg border bg-card px-3 py-2.5 text-sm shadow-[var(--shadow-md)] overflow-hidden",
                t.variant === "success" && "border-success/30",
                t.variant === "danger" && "border-destructive/30",
                t.variant === "info" && "border-info/30",
                t.variant === "default" && "border-border"
              )}
              role="status"
            >
              {t.variant === "success" && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />}
              {t.variant === "danger" && <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />}
              {t.variant === "info" && <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />}
              <span className="flex-1 leading-snug">{t.message}</span>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <X className="size-3.5" aria-hidden />
              </button>
              <motion.div
                className="absolute bottom-0 left-0 h-0.5 bg-primary/40"
                initial={{ width: "100%" }}
                animate={{ width: "0%" }}
                transition={{ duration: (t.duration || 4000) / 1000, ease: "linear" }}
                aria-hidden
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
