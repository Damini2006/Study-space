import { cva } from "class-variance-authority";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef(function Input({ className, type = "text", ...props }, ref) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-9 w-full rounded-lg border border-input bg-surface px-3 py-1 text-sm shadow-sm transition-colors",
        "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
});

export const Textarea = forwardRef(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[70px] w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm shadow-sm transition-colors",
        "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
});

export const Label = forwardRef(function Label({ className, ...props }, ref) {
  return (
    <label
      ref={ref}
      className={cn("text-xs font-medium text-muted-foreground leading-none", className)}
      {...props}
    />
  );
});

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border",
  {
    variants: {
      variant: {
        default: "bg-surface-2 text-muted-foreground border-border",
        primary: "bg-primary/10 text-primary border-primary/25",
        success: "bg-success-bg text-success border-success/25",
        warning: "bg-warning-bg text-warning border-warning/25",
        danger: "bg-danger-bg text-destructive border-destructive/25",
        info: "bg-info-bg text-info border-info/25",
        citation: "bg-citation text-citation-foreground border-transparent",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export function Skeleton({ className, ...props }) {
  return <div className={cn("skeleton h-4 w-full", className)} {...props} />;
}

export function Separator({ className, vertical = false }) {
  return (
    <div
      role="separator"
      aria-orientation={vertical ? "vertical" : "horizontal"}
      className={cn(vertical ? "w-px self-stretch" : "h-px w-full", "bg-border", className)}
    />
  );
}
