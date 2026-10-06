/**
 * Model Router panel — shows the model catalog grouped by provider with cost,
 * latency and capability metadata, plus the model actually routed per task.
 *
 * Read-only by design: routing is deployment config, so the panel explains what
 * the app is using rather than pretending a user can change it from here.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { modelsApi } from "@/services/api-services";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Cpu, Gauge, HelpCircle, Sparkles } from "lucide-react";

const TASK_LABELS = {
  chat: "Chat answers",
  generate: "Studio generation",
  judge: "Claim verification",
  embed: "Embeddings",
  classify: "Relevance gate",
};

const PROVIDER_LABELS = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  local: "Local (Ollama / vLLM)",
  litellm: "LiteLLM proxy",
};

const LATENCY_STYLES = {
  fast: "text-success",
  medium: "text-muted-foreground",
  slow: "text-warning",
};

function formatCost(per1k) {
  // null means "no published price" (an undocumented model behind a proxy), which
  // is different from zero — a free local model genuinely costs $0.
  if (per1k === null || per1k === undefined) return "price unknown";
  if (per1k === 0) return "free";
  if (per1k < 0.001) return `$${per1k.toFixed(5)}/1k`;
  return `$${per1k.toFixed(4)}/1k`;
}

function ModelRow({ model }) {
  const isActive = model.is_default_for?.length > 0;
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-2 rounded-md border px-3 py-2",
        isActive ? "border-primary/40 bg-primary/5" : "border-border"
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{model.display_name}</span>
          {isActive ? (
            <Badge variant="info">
              {model.is_default_for.map((t) => TASK_LABELS[t] ?? t).join(", ")}
            </Badge>
          ) : null}
          {!model.known ? (
            <span
              className="inline-flex items-center gap-1 text-xs text-muted-foreground"
              title="Configured but not in the bundled catalog, so its cost and limits aren't documented here."
            >
              <HelpCircle className="size-3" /> undocumented
            </span>
          ) : null}
        </div>
        <p className="truncate font-mono text-xs text-muted-foreground">{model.model_id}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-xs">
        <span className={cn("flex items-center gap-1", LATENCY_STYLES[model.latency_class])}>
          <Gauge className="size-3" />
          {model.latency_class}
        </span>
        <span className="text-muted-foreground">
          {formatCost(model.cost_per_1k_input)} in · {formatCost(model.cost_per_1k_output)} out
        </span>
      </div>
    </div>
  );
}

export default function ModelRouterPanel() {
  const { data: catalog, isLoading, isError } = useQuery({
    queryKey: ["models", "catalog"],
    queryFn: modelsApi.catalog,
    staleTime: 10 * 60_000,
  });

  const { data: defaults } = useQuery({
    queryKey: ["models", "defaults"],
    queryFn: modelsApi.defaults,
    staleTime: 10 * 60_000,
  });

  const providers = useMemo(
    () => Object.entries(catalog?.models ?? {}).sort(([a], [b]) => a.localeCompare(b)),
    [catalog]
  );

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <h3 className="font-semibold">Task routing</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Each step of the answer pipeline can run on a different model, so a cheap model handles
          relevance and judging while a stronger one writes the answer. A space can override any of
          these from Retrieval settings.
        </p>
        <dl className="grid gap-2 pt-1 sm:grid-cols-2">
          {Object.entries(TASK_LABELS).map(([task, label]) => (
            <div
              key={task}
              className="flex items-baseline justify-between gap-3 rounded-md border px-3 py-2"
            >
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="truncate font-mono text-xs">{defaults?.[task] ?? "—"}</dd>
            </div>
          ))}
        </dl>
        {catalog?.proxy_configured ? (
          <p className="text-xs text-muted-foreground">
            Requests go through a LiteLLM proxy, so local and self-hosted models are not offered as
            fallbacks.
          </p>
        ) : null}
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Cpu className="size-4 text-primary" />
          <h3 className="font-semibold">Model catalog</h3>
        </div>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading catalog…</p> : null}
        {isError ? (
          <p className="text-sm text-destructive">
            Could not load the model catalog. Check that the API is reachable.
          </p>
        ) : null}
        {!isLoading && !isError && providers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No models reported by the server.</p>
        ) : null}
        {providers.map(([provider, models]) => (
          <div key={provider} className="space-y-2 pt-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {PROVIDER_LABELS[provider] ?? provider}
            </h4>
            <div className="space-y-2">
              {models.map((model) => (
                <ModelRow key={model.id} model={model} />
              ))}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
