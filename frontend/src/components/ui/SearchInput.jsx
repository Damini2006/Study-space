import { cn } from "@/lib/utils";

/**
 * Search input with a leading icon, consistent across pages.
 * - value/onChange are controlled.
 * - icon: lucide component (default: Search).
 * - placeholder: string.
 * - className: extends the wrapper div.
 */
export function SearchInput({ value, onChange, placeholder, icon: Icon, className }) {
  return (
    <div className={cn("relative max-w-sm flex-1", className)}>
      {Icon && (
        <Icon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      )}
      <input
        type="search"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={cn(
          "w-full h-9 rounded-lg border border-input bg-card px-3 pl-10 text-sm",
          "placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        )}
      />
    </div>
  );
}