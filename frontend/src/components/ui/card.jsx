import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Card = forwardRef(function Card({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn("card-hover rounded-2xl border border-border bg-card text-card-foreground shadow-[var(--shadow-sm)]", className)}
      {...props}
    />
  );
});

export const CardHeader = forwardRef(function CardHeader({ className, ...props }, ref) {
  return <div ref={ref} className={cn("flex flex-col gap-1.5 p-4 pb-2", className)} {...props} />;
});

export const CardTitle = forwardRef(function CardTitle({ className, ...props }, ref) {
  return <h3 ref={ref} className={cn("text-sm font-semibold leading-none tracking-tight", className)} {...props} />;
});

export const CardDescription = forwardRef(function CardDescription({ className, ...props }, ref) {
  return <p ref={ref} className={cn("text-xs text-muted-foreground", className)} {...props} />;
});

export const CardContent = forwardRef(function CardContent({ className, ...props }, ref) {
  return <div ref={ref} className={cn("p-4 pt-2", className)} {...props} />;
});

export const CardFooter = forwardRef(function CardFooter({ className, ...props }, ref) {
  return <div ref={ref} className={cn("flex items-center p-4 pt-0", className)} {...props} />;
});

export const CardSkeleton = forwardRef(function CardSkeleton({ className, lines = 3, ...props }, ref) {
  return (
    <div
      ref={ref}
      role="status"
      aria-label="Loading content"
      className={cn("rounded-2xl border border-border bg-card p-4 space-y-3", className)}
      {...props}
    >
      <div className="h-4 w-1/3 animate-pulse rounded bg-surface-2" />
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3 animate-pulse rounded bg-surface-2"
          style={{ width: `${100 - i * 15}%` }}
        />
      ))}
      <span className="sr-only">Loading...</span>
    </div>
  );
});
