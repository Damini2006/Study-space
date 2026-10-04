import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { id: "light", label: "Light", Icon: Sun },
  { id: "dark", label: "Dark", Icon: Moon },
];

/**
 * Light / dark switch for the marketing pages.
 * The full four-theme picker lives in Settings and the app shell.
 */
export default function ThemeToggle({ className, size = "md" }) {
  const { theme, setTheme } = useTheme();
  const active = theme === "dark" ? "dark" : "light";

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-surface/70 p-0.5 backdrop-blur",
        className
      )}
    >
      {OPTIONS.map(({ id, label, Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            aria-label={`Use ${label.toLowerCase()} theme`}
            aria-pressed={isActive}
            onClick={() => setTheme(id)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-full font-medium",
              "transition-all duration-200 ease-out",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              isActive
                ? "bg-primary text-on-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground",
              size === "sm" ? "h-7 w-7" : "h-7 px-2.5"
            )}
          >
            <Icon
              className={cn(
                "transition-transform duration-300",
                size === "sm" ? "size-3.5" : "size-3.5",
                isActive && (id === "dark" ? "rotate-0" : "rotate-0")
              )}
            />
            {size !== "sm" && (
              <span className={cn("text-[12px] leading-none", isActive ? "inline" : "hidden sm:inline")}>
                {label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
