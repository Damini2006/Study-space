import { useRef, useState, useEffect, useCallback } from "react";
import { Minimize2, PanelLeft, PanelRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * SplitView — two resizable panes with a draggable gutter.
 * Supports horizontal (side-by-side) and vertical (top/bottom) layouts.
 * Persists ratio in localStorage per key.
 */
export default function SplitView({
  children,
  layout = "horizontal",
  defaultRatio = 0.5,
  minRatio = 0.15,
  maxRatio = 0.85,
  storageKey,
  onRatioChange,
  className,
  _gutterSize = 8,
  showCollapseButtons = true,
}) {
  const [ratio, setRatio] = useState(() => {
    if (storageKey) {
      const saved = localStorage.getItem(`splitview:${storageKey}`);
      if (saved) return Math.max(minRatio, Math.min(maxRatio, parseFloat(saved)));
    }
    return defaultRatio;
  });
  const [dragging, setDragging] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const gutterRef = useRef(null);
  const pane1Ref = useRef(null);
  const pane2Ref = useRef(null);

  // Load saved ratio on mount
  useEffect(() => {
    if (storageKey) {
      const saved = localStorage.getItem(`splitview:${storageKey}`);
      if (saved) {
        const r = Math.max(minRatio, Math.min(maxRatio, parseFloat(saved)));
        setRatio(r);
      }
    }
  }, [storageKey, minRatio, maxRatio]);

  // Persist ratio
  useEffect(() => {
    if (storageKey && !dragging) {
      localStorage.setItem(`splitview:${storageKey}`, ratio.toString());
    }
    onRatioChange?.(ratio);
  }, [ratio, storageKey, dragging, onRatioChange]);

  const handleMouseDown = (e) => {
    if (collapsed) return;
    e.preventDefault();
    setDragging(true);
    document.body.style.cursor = layout === "horizontal" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
  };

  const handleMouseMove = useCallback((e) => {
    if (!dragging || collapsed) return;

    const container = gutterRef.current?.parentElement;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    let newRatio;

    if (layout === "horizontal") {
      const offset = e.clientX - rect.left;
      newRatio = offset / rect.width;
    } else {
      const offset = e.clientY - rect.top;
      newRatio = offset / rect.height;
    }

    newRatio = Math.max(minRatio, Math.min(maxRatio, newRatio));
    setRatio(newRatio);
  }, [dragging, collapsed, layout, minRatio, maxRatio]);

  const handleMouseUp = () => {
    setDragging(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  useEffect(() => {
    if (dragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, handleMouseMove]);

  // Keyboard support for gutter focus
  const handleKeyDown = (e) => {
    if (collapsed) return;
    const step = 0.02;
    let newRatio = ratio;

    if (layout === "horizontal") {
      if (e.key === "ArrowLeft") newRatio -= step;
      if (e.key === "ArrowRight") newRatio += step;
    } else {
      if (e.key === "ArrowUp") newRatio -= step;
      if (e.key === "ArrowDown") newRatio += step;
    }

    if (newRatio !== ratio) {
      e.preventDefault();
      setRatio(Math.max(minRatio, Math.min(maxRatio, newRatio)));
    }

    // Toggle collapse with Enter/Space
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setCollapsed(!collapsed);
    }
  };

  const toggleCollapse = () => setCollapsed(!collapsed);

  // Render children — expect exactly 2 elements
  const kids = Array.isArray(children) ? children : [children];
  const [pane1, pane2] = kids;

  const isHorizontal = layout === "horizontal";

  return (
    <div
      ref={gutterRef}
      className={cn(
        "relative flex overflow-hidden",
        isHorizontal ? "flex-row" : "flex-col",
        className
      )}
      style={{ width: "100%", height: "100%" }}
    >
      {/* Pane 1 */}
      <div
        ref={pane1Ref}
        className={cn(
          "flex flex-col overflow-hidden transition-all duration-200",
          isHorizontal
            ? collapsed ? "w-0 min-w-0" : "flex-1"
            : collapsed ? "h-0 min-h-0" : "flex-1"
        )}
        style={{
          flex: collapsed ? "0 0 0" : 1,
          width: isHorizontal && !collapsed ? `${ratio * 100}%` : undefined,
          height: !isHorizontal && !collapsed ? `${ratio * 100}%` : undefined,
          minWidth: isHorizontal ? `${minRatio * 100}%` : undefined,
          minHeight: !isHorizontal ? `${minRatio * 100}%` : undefined,
          maxWidth: isHorizontal ? `${maxRatio * 100}%` : undefined,
          maxHeight: !isHorizontal ? `${maxRatio * 100}%` : undefined,
        }}
      >
        {pane1}
      </div>

      {/* Gutter */}
      {!collapsed && (
        <button
          ref={gutterRef}
          type="button"
          tabIndex={0}
          role="separator"
          aria-label={isHorizontal ? "Resize panes horizontally" : "Resize panes vertically"}
          aria-orientation={isHorizontal ? "horizontal" : "vertical"}
          aria-valuemin={Math.round(minRatio * 100)}
          aria-valuemax={Math.round(maxRatio * 100)}
          aria-valuenow={Math.round(ratio * 100)}
          onMouseDown={handleMouseDown}
          onKeyDown={handleKeyDown}
          className={cn(
            "flex items-center justify-center select-none transition-colors",
            isHorizontal
              ? "w-[8px] cursor-col-resize hover:bg-primary/20"
              : "h-[8px] cursor-row-resize hover:bg-primary/20",
            dragging && "bg-primary/30",
            "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          )}
          style={{ flexShrink: 0 }}
        >
          <div
            className={cn(
              "rounded-full bg-border transition-colors",
              dragging && "bg-primary",
              isHorizontal ? "w-1 h-10" : "w-10 h-1"
            )}
            aria-hidden
          />
        </button>
      )}

      {/* Collapsed state — show thin bar to expand */}
      {collapsed && (
        <button
          type="button"
          onClick={toggleCollapse}
          className={cn(
            "flex items-center justify-center bg-surface-2 border border-border transition-colors hover:bg-primary/10",
            isHorizontal ? "w-6 h-full" : "h-6 w-full"
          )}
          aria-label="Expand pane"
        >
          {isHorizontal ? (
            <PanelRight className="size-4 text-muted-foreground" />
          ) : (
            <div style={{ transform: "rotate(90deg)" }}><PanelLeft className="size-4 text-muted-foreground" /></div>
          )}
        </button>
      )}

      {/* Pane 2 */}
      <div
        ref={pane2Ref}
        className={cn(
          "flex flex-col overflow-hidden transition-all duration-200",
          isHorizontal ? "flex-1 min-w-0" : "flex-1 min-h-0"
        )}
        style={{
          width: isHorizontal && collapsed ? "100%" : undefined,
          height: !isHorizontal && collapsed ? "100%" : undefined,
        }}
      >
        {pane2}
      </div>

      {/* Collapse buttons on gutter */}
      {showCollapseButtons && !collapsed && (
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="absolute top-2 right-2 z-10 p-1 rounded bg-surface-2/80 hover:bg-surface-2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Collapse left pane"
          style={{ [isHorizontal ? "left" : "top"]: "calc(50% + 4px)" }}
        >
          <Minimize2 className="size-3" />
        </button>
      )}
    </div>
  );
}