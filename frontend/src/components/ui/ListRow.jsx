import { cn } from "@/lib/utils";

/**
 * Consistent list row used by Notes, Planner, Focus, Dashboard sidebar.
 * - leading: icon/avatar/colour dot (required).
 * - title: main text (required).
 * - meta: secondary text (optional).
 * - trailing: duration/chip/button group (optional).
 * - onClick: makes the whole row a link/button.
 * - deleteAction: optional destructive icon button (renders trailing if no trailing given).
 */
export function ListRow({
  leading,
  title,
  meta,
  trailing,
  onClick,
  deleteAction,
  className,
  disabled,
}) {
  const content = (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="flex-shrink-0">{leading}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        {meta ? <p className="text-[11px] text-muted-foreground">{meta}</p> : null}
      </div>
      {trailing ? (
        <div className="flex-shrink-0">{trailing}</div>
      ) : deleteAction ? (
        <button
          type="button"
          onClick={deleteAction}
          aria-label="Delete"
          className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-destructive"
        >
          {deleteAction.icon}
        </button>
      ) : null}
    </div>
  );

  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full p-4 rounded-lg border border-border bg-surface transition-colors hover:bg-surface-2",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      {content}
    </button>
  ) : (
    <div className={cn("p-4 rounded-lg border border-border bg-surface", className)}>{content}</div>
  );
}