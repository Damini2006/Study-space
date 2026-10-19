import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Honest empty state used everywhere a list can be empty.
 * - icon: lucide icon component (required).
 * - title: one line, sentence case.
 * - description: explains why it's empty and what to do.
 * - action: optional CTA (Link/Button/Fragment).
 * - className: extends the Card.
 */
export function EmptyState({ icon: Icon, title, description, className }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-8 text-center", className)}>
      <Icon className="size-12 mx-auto text-muted-foreground mb-3" aria-hidden />
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <Button variant="outline" size="sm" onClick={() => {}} className="mt-4">
        Got it
      </Button>
    </div>
  );
}