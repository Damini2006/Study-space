/**
 * Model Router panel — shows the model catalog grouped by provider with cost,
 * latency and capability metadata, plus the currently routed model per task.
 * Read-only by design: routing is deployment config, so the panel explains what
 * the app is using rather than pretending a user can change it here.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { modelsApi } from "@/services/api-services";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Cpu, Gauge, Sparkles } from "lucide-react";

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
  if (!per1k) return "free";
  if (per1k < 0.001) return `$${per1k.toFixed(5)}/1k`;
  return `$${per1k.toFixed(4)}/1k`;
}

function ModelRow({ model, isActive }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-2 rounded-md border px-3 py-2",
        isActive ? "border-primary/40 bg-primary/5" : "border-border"
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{model.display_name}</span>
          {isActive ? <Badge variant="info">In use</Badge> : null}
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
  const { data: catalog, isLoading } = useQuery({
    queryKey: ["models", "catalog"],
    queryFn: modelsApi.catalog,
    staleTime: 10 * 60_000,
  });

  const { data: defaults } = useQuery({
    queryKey: ["models", "defaults"],
    queryFn: modelsApi.defaults,
    staleTime: 10 * 60_000,
  });

  // A model counts as "in use" if it is routed for any task.
  const activeModels = useMemo(() => new Set(Object.values(defaults ?? {})), [defaults]);

  const providers = useMemo(() => {
    const grouped = catalog?.models ?? {};
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, [catalog]);

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <h3 className="font-semibold">Task routing</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Each step of the answer pipeline can run on a different model, so a cheap model handles the
          relevance gate while a stronger one writes the answer.
        </p>
        <dl className="grid gap-2 pt-1 sm:grid-cols-2">
          {Object.entries(TASK_LABELS).map(([task, label]) => (
            <div key={task} className="flex items-baseline justify-between gap-3 rounded-md border px-3 py-2">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="truncate font-mono text-xs">{defaults?.[task] ?? "—"}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Cpu className="size-4 text-primary" />
          <h3 className="font-semibold">Model catalog</h3>
        </div>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading catalog…</p> : null}
        {!isLoading && providers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No models reported by the server.</p>
        ) : null}
        {providers.map(([provider, models]) => (
          <div key={provider} className="space-y-2 pt-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {PROVIDER_LABELS[provider] ?? provider}
            </h4>
            <div className="space-y-2">
              {models.map((model) => (
                <ModelRow key={model.id} model={model} isActive={activeModels.has(model.id)} />
              ))}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}