import { createContext, useContext, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Accessible modal dialog: focus trap basics, Escape to close, backdrop
 * click, scroll lock, ARIA dialog semantics.
 */
export function Dialog({ open, onClose, title, description, children, className, footer }) {
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    // Store previously focused element
    previousFocusRef.current = document.activeElement;

    const onKey = (e) => {
      if (e.key === "Escape") {
        onClose?.();
        return;
      }

      // Focus trap: Tab key cycles through focusable elements
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus the dialog on open
    requestAnimationFrame(() => {
      const focusable = dialogRef.current?.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      focusable?.focus();
    });

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      // Restore previous focus
      previousFocusRef.current?.focus();
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
            ref={dialogRef}
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
      <div
        className={cn(TAB_VARIANTS[variant], className)}
        data-variant={variant}
        role="tablist"
        aria-label={ariaLabel}
        aria-orientation="horizontal"
      >
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

/**
 * Select — native <select> with consistent styling.
 * Use with SelectTrigger, SelectValue, SelectContent, SelectItem.
 */
const SelectContext = createContext(null);

export function Select({ value, onValueChange, children, disabled }) {
  return (
    <SelectContext.Provider value={{ value, onValueChange, disabled }}>
      {children}
    </SelectContext.Provider>
  );
}

export function SelectTrigger({ value, placeholder, className, disabled }) {
  const ctx = useContext(SelectContext);
  const isDisabled = disabled || ctx?.disabled;
  const currentValue = value ?? ctx?.value;
  const handleChange = (e) => ctx?.onValueChange?.(e.target.value);

  return (
    <select
      value={currentValue ?? ""}
      onChange={handleChange}
      disabled={isDisabled}
      className={cn(
        "flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      aria-label={placeholder}
    >
      {!currentValue && <option value="" disabled>{placeholder}</option>}
      {currentValue && <option value={currentValue} selected>{currentValue}</option>}
    </select>
  );
}

export function SelectValue({ placeholder }) {
  // Used as a placeholder in the trigger
  return <span className="text-muted-foreground">{placeholder}</span>;
}

export function SelectContent({ children, className }) {
  return (
    <div className={cn("relative z-50 max-h-60 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg", className)}>
      {children}
    </div>
  );
}

export function SelectItem({ value, children, disabled, className }) {
  const ctx = useContext(SelectContext);
  const isSelected = ctx?.value === value;
  const handleClick = () => {
    if (disabled) return;
    ctx?.onValueChange?.(value);
  };

  return (
    <div
      role="option"
      aria-selected={isSelected}
      aria-disabled={disabled}
      onClick={handleClick}
      className={cn(
        "relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none",
        "focus:bg-primary focus:text-primary-foreground",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        isSelected && "bg-primary text-primary-foreground",
        className
      )}
      data-disabled={disabled}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        {isSelected && <Check className="size-3.5" />}
      </span>
      {children}
    </div>
  );
}

/**
 * RadioGroup — accessible radio button group with styled items.
 */
const RadioContext = createContext(null);

export function RadioGroup({ value, onValueChange, children, className, disabled }) {
  return (
    <RadioContext.Provider value={{ value, onValueChange, disabled }}>
      <div role="radiogroup" className={cn("flex flex-col gap-1", className)}>
        {children}
      </div>
    </RadioContext.Provider>
  );
}

export function RadioGroupItem({ value, children, className, disabled }) {
  const ctx = useContext(RadioContext);
  const isSelected = ctx?.value === value;
  const isDisabled = disabled || ctx?.disabled;

  return (
    <label
      className={cn(
        "relative flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isDisabled ? "cursor-not-allowed opacity-50" : "hover:bg-surface-2",
        isSelected && "border-primary/40 bg-primary/5",
        className
      )}
    >
      <input
        type="radio"
        value={value}
        checked={isSelected}
        onChange={() => !isDisabled && ctx?.onValueChange?.(value)}
        disabled={isDisabled}
        className="sr-only"
      />
      <span
        className={cn(
          "relative flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors",
          isSelected ? "border-primary bg-primary" : "border-border",
          isDisabled && "opacity-50"
        )}
      >
        {isSelected && <span className="absolute size-2 rounded-full bg-white" />}
      </span>
      <span className={cn("font-medium", isSelected ? "text-foreground" : "text-muted-foreground")}>
        {children}
      </span>
    </label>
  );
}
