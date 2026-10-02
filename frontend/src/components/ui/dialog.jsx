import { createContext, useContext, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Accessible modal dialog: focus trap basics, Escape to close, backdrop
 * click, scroll lock, ARIA dialog semantics.
 */
export function Dialog({ open, onClose, title, description, children, className, footer }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 backdrop-blur-[2px] sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose?.();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === "string" ? title : "Dialog"}
            initial={{ opacity: 0, y: 14, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className={cn(
              "relative max-h-[88vh] w-full overflow-auto rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-lg)]",
              "max-w-lg scrollbar-thin",
              className
            )}
          >
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">{title}</h2>
                {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="rounded-md p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            {children}
            {footer && <div className="mt-4 flex justify-end gap-2">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const TAB_VARIANTS = {
  line: "border-b border-border",
  pill: "bg-surface-2 p-1 rounded-lg rounded-lg",
};

const TabsContext = createContext(null);

export function Tabs({ value, onValueChange, children, variant = "line", className, ariaLabel }) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={cn(TAB_VARIANTS[variant], className)} data-variant={variant}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className }) {
  return (
    <div role="tablist" className={cn("flex gap-1", className)}>
      {children}
    </div>
  );
}

export function TabsTrigger({ value, children, className }) {
  const ctx = useContext(TabsContext);
  const active = ctx?.value === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => ctx?.onValueChange?.(value)}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
        className
      )}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, children, className }) {
  const ctx = useContext(TabsContext);
  if (ctx && ctx.value !== value) return null;
  return (
    <div role="tabpanel" className={cn("focus:outline-none", className)}>
      {children}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
        checked ? "bg-primary" : "bg-border",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <span
        className={cn(
          "pointer-events-none block h-4 w-4 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  );
}
