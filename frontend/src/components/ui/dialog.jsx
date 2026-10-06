import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Accessible modal dialog: focus trap basics, Escape to close, backdrop
 * click, scroll lock, ARIA dialog semantics.
 */
export function Dialog({ open, onClose, title, description, children, className, footer }) {
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  // Read through a ref so the effect below depends only on `open`. An inline
  // `onClose` gives the dialog a fresh identity on every parent render, and
  // each new identity tears the effect down and rebuilds it — pulling focus
  // back to the top of the dialog while someone is typing inside it.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;

    previousFocusRef.current = document.activeElement;

    // Disabled controls have to be left out: if the first control is a
    // disabled button, `activeElement === first` can never be true and
    // Shift+Tab walks straight out of the dialog.
    const focusableSelector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
      'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const getFocusable = () => {
      const nodes = dialogRef.current?.querySelectorAll(focusableSelector) ?? [];
      return Array.from(nodes).filter(
        (node) => !node.hidden && node.getAttribute("aria-hidden") !== "true"
      );
    };

    const onKey = (event) => {
      if (event.key === "Escape") {
        onCloseRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = getFocusable();
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const isInside = Boolean(active) && dialogRef.current?.contains(active);

      if (!isInside) {
        // Focus has been stranded outside the dialog, and Tab would then walk
        // into the page behind it. Pull it back before moving on.
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);

    // Hiding the scrollbar narrows the viewport by its own width, which shifts
    // the page sideways every time a dialog opens. Put that width back — but
    // only where there was a scrollbar to lose.
    const root = document.documentElement;
    const scrollbarWidth =
      root.scrollHeight > root.clientHeight ? window.innerWidth - root.clientWidth : 0;
    const previousOverflow = document.body.style.overflow;
    const previousPadding = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    // Focus the dialog element itself rather than its first control, so a
    // screen reader announces the title and description before anything
    // inside it — landing on the close button announced only "Close dialog".
    const frame = requestAnimationFrame(() => dialogRef.current?.focus());

    return () => {
      document.removeEventListener("keydown", onKey);
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPadding;
      const previous = previousFocusRef.current;
      // Whatever triggered the close usually unmounts the trigger with it, and
      // focus() on a detached node silently does nothing — focus would land
      // on <body> and the next Tab would restart from the top of the page.
      if (previous && previous.isConnected) previous.focus();
    };
  }, [open]);

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
            aria-labelledby={title ? titleId : undefined}
            aria-label={title ? undefined : "Dialog"}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            initial={{ opacity: 0, y: 14, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className={cn(
              "relative max-h-[88vh] w-full overflow-auto rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-lg)]",
              "max-w-lg scrollbar-thin",
              "focus:outline-none",
              className
            )}
          >
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <h2 id={titleId} className="text-base font-semibold">{title}</h2>
                {description && (
                  <p id={descriptionId} className="mt-1 text-xs text-muted-foreground">
                    {description}
                  </p>
                )}
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

/**
 * Tabs — a WAI-ARIA tab set.
 *
 * `TabsList` owns `role="tablist"`; `Tabs` is only the wrapper. Putting the
 * role on both nested a tablist inside another, which meant the triggers
 * were ambiguously owned and the inner list was an unexpected child of the
 * outer one.
 *
 * Selection uses a roving tabindex: the selected tab is the one in the
 * page's Tab order and the arrow keys move between the rest, selecting as
 * they go. Automatic activation is right here because the panels are cheap.
 */
export function Tabs({
  value,
  defaultValue,
  onValueChange,
  children,
  variant = "line",
  className,
  ariaLabel,
}) {
  const baseId = useId();

  // `value` controls the selection whenever it is present. Without one,
  // `defaultValue` seeds an internal selection instead — Analytics passes
  // `defaultValue`, which was silently ignored, so nothing was ever equal to
  // the unset value and every panel returned null.
  const [selected, setSelected] = useState(defaultValue);
  const active = value !== undefined ? value : selected;

  const select = (next) => {
    setSelected(next);
    onValueChange?.(next);
  };

  return (
    <TabsContext.Provider
      value={{ value: active, onValueChange: select, ariaLabel, baseId }}
    >
      <div className={cn(TAB_VARIANTS[variant], className)} data-variant={variant}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className }) {
  const ctx = useContext(TabsContext);

  // Arrow keys are required by the pattern, and are the only way between
  // tabs once the roving tabindex leaves a single tab in the Tab order.
  const onKeyDown = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;

    const tabs = Array.from(
      event.currentTarget.querySelectorAll('[role="tab"]:not([disabled])')
    );
    if (tabs.length === 0) return;

    const current = tabs.findIndex((tab) => tab === document.activeElement);
    let index;
    if (event.key === "Home") {
      index = 0;
    } else if (event.key === "End") {
      index = tabs.length - 1;
    } else if (current < 0) {
      index = event.key === "ArrowRight" ? 0 : tabs.length - 1;
    } else {
      const step = event.key === "ArrowRight" ? 1 : -1;
      index = (current + step + tabs.length) % tabs.length;
    }

    event.preventDefault();
    tabs[index].focus();
    tabs[index].click();
  };

  return (
    <div
      role="tablist"
      aria-label={ctx?.ariaLabel}
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className={cn("flex gap-1", className)}
    >
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
      id={ctx ? `${ctx.baseId}-tab-${value}` : undefined}
      // Only the selected tab points at a panel, because only that panel is
      // mounted — an aria-controls naming an id that isn't in the document
      // is a broken reference rather than a useful one.
      aria-controls={ctx && active ? `${ctx.baseId}-panel-${value}` : undefined}
      aria-selected={active}
      tabIndex={active ? 0 : -1}
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
    <div
      role="tabpanel"
      id={ctx ? `${ctx.baseId}-panel-${value}` : undefined}
      aria-labelledby={ctx ? `${ctx.baseId}-tab-${value}` : undefined}
      // Focusable so that a panel holding nothing focusable is still
      // reachable — there is only ever one of these in the tab order.
      tabIndex={0}
      className={cn("focus:outline-none", className)}
    >
      {children}
    </div>
  );
}

export function Switch({ id, checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      id={id}
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
 * Select — a native `<select>` styled to match the rest of the design system.
 *
 * Deliberately the platform control rather than a hand-built listbox: for a
 * flat list of options, native gives keyboard navigation, screen-reader
 * support and the mobile picker for free, and none of it is code we can get
 * subtly wrong. Options arrive as data, so every choice is a real `<option>`
 * and the trigger can never be showing something that isn't one of them.
 *
 * `placeholder` becomes a disabled `<option>` only while `value` matches
 * nothing in `options`. That test is against the list rather than against the
 * string, because `""` is a legitimate value — the model selectors use it for
 * "Deployment default".
 *
 * `options` is `{ value, label, disabled? }[]`.
 */
export function Select({
  value,
  onValueChange,
  options = [],
  placeholder,
  id,
  disabled,
  className,
  ariaLabel,
}) {
  const current = value == null ? "" : String(value);
  const currentIsAnOption = options.some((option) => String(option.value) === current);

  return (
    <select
      id={id}
      value={currentIsAnOption ? current : ""}
      onChange={(event) => onValueChange?.(event.target.value)}
      disabled={disabled}
      className={cn(
        "flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      aria-label={ariaLabel}
    >
      {currentIsAnOption ? null : (
        <option value="" disabled hidden>
          {placeholder}
        </option>
      )}
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/**
 * RadioGroup — accessible radio button group with styled items.
 */
const RadioContext = createContext(null);

/**
 * RadioGroup — a named group of radio cards.
 *
 * `RadioGroupItem` owns its own `<label>`, so callers pass their content as
 * children instead of wrapping it in a second one. Nesting a `<label>` in a
 * `<label>` is invalid, and it gave the input two competing sources for its
 * accessible name.
 */
export function RadioGroup({
  value,
  onValueChange,
  children,
  className,
  disabled,
  ariaLabel,
}) {
  return (
    <RadioContext.Provider value={{ value, onValueChange, disabled }}>
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        className={cn("flex flex-col gap-1", className)}
      >
        {children}
      </div>
    </RadioContext.Provider>
  );
}

export function RadioGroupItem({ value, children, className, disabled, hideIndicator }) {
  const ctx = useContext(RadioContext);
  const isSelected = ctx?.value === value;
  const isDisabled = disabled || ctx?.disabled;

  return (
    <label
      className={cn(
        "relative flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm transition-colors",
        isDisabled ? "cursor-not-allowed opacity-50" : "hover:bg-surface-2",
        isSelected && "border-primary bg-primary/5 ring-2 ring-primary/20",
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
      {hideIndicator ? null : (
        <span
          className={cn(
            "relative flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            isSelected ? "border-primary bg-primary" : "border-border",
            isDisabled && "opacity-50"
          )}
        >
          {isSelected && <span className="absolute size-2 rounded-full bg-white" />}
        </span>
      )}
      {children}
    </label>
  );
}
