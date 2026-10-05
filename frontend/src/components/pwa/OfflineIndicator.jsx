/**
 * Connection status pill plus the "reviews waiting to sync" counter.
 * Rendered in the app shell so offline state is visible everywhere, not just
 * on the review screen where it actually matters.
 */
import { useOnlineStatus, useReviewQueueSync } from "@/hooks/usePwa";
import { cn } from "@/lib/utils";
import { CloudOff, RefreshCw } from "lucide-react";

export default function OfflineIndicator({ className }) {
  const { showBanner } = useOnlineStatus();
  const { pending, flush } = useReviewQueueSync();

  const show = showBanner || pending > 0;
  if (!show) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1 text-xs",
        showBanner ? "border-warning/40 bg-warning/10 text-warning" : "border-border bg-surface-2",
        className
      )}
    >
      {showBanner ? <CloudOff className="size-3.5" /> : <RefreshCw className="size-3.5" />}
      <span>
        {showBanner
          ? pending > 0
            ? `Offline — ${pending} review${pending === 1 ? "" : "s"} saved locally`
            : "Offline — your work is saved locally"
          : `Syncing ${pending} review${pending === 1 ? "" : "s"}…`}
      </span>
      {pending > 0 && !showBanner ? (
        <button
          type="button"
          onClick={() => flush()}
          className="font-medium underline underline-offset-2"
        >
          Retry now
        </button>
      ) : null}
    </div>
  );
}