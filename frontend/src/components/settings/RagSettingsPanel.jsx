/**
 * Per-space RAG tuning — retrieval weights, reranking, the three safety layers
 * and generation knobs. Changes are committed on an explicit Save so a slider
 * drag doesn't fire a PATCH per frame, and each field shows its effective value
 * so you can tell a global default from a per-space override.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ragApi } from "@/services/api-services";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { Switch, Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/dialog";
import { modelsApi } from "@/services/api-services";
import { cn } from "@/lib/utils";
import { Loader2, RotateCcw, Save, SlidersHorizontal } from "lucide-react";

const PRESETS = {
  balanced: {
    top_k: 12,
    vector_weight: 0.7,
    fts_weight: 0.3,
    rerank_enabled: true,
    rerank_top_n: 8,
    relevance_gate: true,
    relevance_threshold: 0.35,
    citation_validation: true,
    claim_verification: true,
    temperature: 0.3,
    max_tokens: 2048,
    socratic_mode: false,
  },
  precise: {
    top_k: 8,
    vector_weight: 0.85,
    fts_weight: 0.15,
    rerank_enabled: true,
    rerank_top_n: 6,
    relevance_gate: true,
    relevance_threshold: 0.55,
    citation_validation: true,
    claim_verification: true,
    temperature: 0.1,
    max_tokens: 1536,
    socratic_mode: false,
  },
  exploratory: {
    top_k: 20,
    vector_weight: 0.5,
    fts_weight: 0.5,
    rerank_enabled: true,
    rerank_top_n: 12,
    relevance_gate: false,
    relevance_threshold: 0.2,
    citation_validation: true,
    claim_verification: false,
    temperature: 0.7,
    max_tokens: 3072,
    socratic_mode: false,
  },
  socratic: {
    top_k: 10,
    vector_weight: 0.7,
    fts_weight: 0.3,
    rerank_enabled: true,
    rerank_top_n: 8,
    relevance_gate: true,
    relevance_threshold: 0.35,
    citation_validation: true,
    claim_verification: false,
    temperature: 0.4,
    max_tokens: 2048,
    socratic_mode: true,
  },
};

function Slider({ id, label, hint, value, onChange, min, max, step }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <span className="font-mono text-xs text-muted-foreground">{value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function LayerSwitch({ id, label, description, checked, onChange }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border px-3 py-2">
      <div className="min-w-0">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

export default function RagSettingsPanel({ spaceId }) {
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(null);

  const queryKey = ["rag-settings", spaceId];
  const { data: saved, isLoading } = useQuery({
    queryKey,
    queryFn: () => ragApi.getSettings(spaceId),
    enabled: Boolean(spaceId),
  });

  const { data: catalog } = useQuery({
    queryKey: ["models", "catalog"],
    queryFn: modelsApi.catalog,
    staleTime: 10 * 60_000,
  });

  // Reset the draft whenever a new space is loaded or the server row changes.
  useEffect(() => {
    setDraft(saved ?? null);
  }, [saved]);

  const save = useMutation({
    mutationFn: (payload) => ragApi.updateSettings(spaceId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      success("RAG settings saved.");
    },
    onError: error,
  });

  const reset = useMutation({
    mutationFn: () => ragApi.resetSettings(spaceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      success("Reverted to global defaults.");
    },
    onError: error,
  });

  if (!spaceId) {
    return (
      <Card className="p-5">
        <p className="text-sm text-muted-foreground">Open a space to tune its retrieval settings.</p>
      </Card>
    );
  }

  if (isLoading || !draft) {
    return (
      <Card className="p-5">
        <p className="text-sm text-muted-foreground">Loading retrieval settings…</p>
      </Card>
    );
  }

  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }));

  // Model override pickers use the same catalog as the model router panel.
  const chatModels = Object.values(catalog?.models ?? {}).flat().filter((m) => m.provider !== "local" || true);
  const taskModels = {
    chat: "Chat answers",
    generate: "Studio generation",
    judge: "Claim verification",
  };

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-primary" />
          <h3 className="font-semibold">Retrieval</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Hybrid search blends the vector index with full-text search, then fuses and reranks the results.
        </p>
        <div className="grid gap-4 pt-1 sm:grid-cols-2">
          <Slider
            id="top_k"
            label="Top-K chunks"
            hint="How many passages reach the model. Higher = more context, more cost."
            value={draft.top_k}
            onChange={(v) => set("top_k", v)}
            min={1}
            max={50}
            step={1}
          />
          <Slider
            id="vector_weight"
            label="Vector weight"
            hint="Share of the hybrid score from semantic similarity."
            value={draft.vector_weight}
            onChange={(v) => set("vector_weight", v)}
            min={0}
            max={1}
            step={0.05}
          />
          <Slider
            id="fts_weight"
            label="Full-text weight"
            hint="Share of the hybrid score from keyword matching."
            value={draft.fts_weight}
            onChange={(v) => set("fts_weight", v)}
            min={0}
            max={1}
            step={0.05}
          />
          <Slider
            id="rerank_top_n"
            label="Rerank depth"
            hint="Candidates handed to the cross-encoder before the top-K is cut."
            value={draft.rerank_top_n}
            onChange={(v) => set("rerank_top_n", v)}
            min={1}
            max={20}
            step={1}
          />
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="font-semibold">Safety layers</h3>
        <p className="text-sm text-muted-foreground">
          Each layer is independently switchable — turn one off to measure what it was catching.
        </p>
        <div className="space-y-2 pt-1">
          <LayerSwitch
            id="rerank_enabled"
            label="Reranking"
            description="Run a cross-encoder over the top candidates to sharpen ordering."
            checked={draft.rerank_enabled}
            onChange={(v) => set("rerank_enabled", v)}
          />
          <LayerSwitch
            id="relevance_gate"
            label="Relevance gate"
            description="Refuse to answer when the best evidence is too weak."
            checked={draft.relevance_gate}
            onChange={(v) => set("relevance_gate", v)}
          />
          <LayerSwitch
            id="citation_validation"
            label="Citation validation"
            description="Every [n] in the answer must map to a retrieved chunk."
            checked={draft.citation_validation}
            onChange={(v) => set("citation_validation", v)}
          />
          <LayerSwitch
            id="claim_verification"
            label="Claim verification"
            description="Check each sentence against the passage it cites."
            checked={draft.claim_verification}
            onChange={(v) => set("claim_verification", v)}
          />
        </div>
        {draft.relevance_gate ? (
          <Slider
            id="relevance_threshold"
            label="Relevance threshold"
            hint="Raise it to abstain more often; lower it to answer more often."
            value={draft.relevance_threshold}
            onChange={(v) => set("relevance_threshold", v)}
            min={0}
            max={1}
            step={0.05}
          />
        ) : null}
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="font-semibold">Generation</h3>
        <div className="grid gap-4 pt-1 sm:grid-cols-2">
          <Slider
            id="temperature"
            label="Temperature"
            value={draft.temperature}
            onChange={(v) => set("temperature", v)}
            min={0}
            max={2}
            step={0.05}
          />
          <Slider
            id="max_tokens"
            label="Max tokens"
            value={draft.max_tokens}
            onChange={(v) => set("max_tokens", v)}
            min={256}
            max={8192}
            step={256}
          />
        </div>
        <LayerSwitch
          id="socratic_mode"
          label="Socratic mode"
          description="Answer with guiding questions instead of the final answer."
          checked={draft.socratic_mode}
          onChange={(v) => set("socratic_mode", v)}
        />
        <div className="grid gap-3 pt-1 sm:grid-cols-3">
          {Object.entries(taskModels).map(([task, label]) => (
            <div key={task} className="space-y-1.5">
              <Label htmlFor={`model_${task}`}>{label}</Label>
              <Select
                value={draft[`${task}_model`] ?? ""}
                onValueChange={(v) => set(`${task}_model`, v)}
              >
                <SelectTrigger placeholder="Global default" />
                <SelectContent>
                  <SelectItem value="">Global default</SelectItem>
                  {chatModels.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="font-semibold">Presets</h3>
        <p className="text-sm text-muted-foreground">Start from a known-good configuration.</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(PRESETS).map(([name, preset]) => (
            <Button key={name} variant="outline" size="sm" onClick={() => setDraft((d) => ({ ...d, ...preset }))}>
              {name}
            </Button>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => reset.mutate()} disabled={reset.isPending}>
          {reset.isPending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
          <span className="ml-1">Revert to globals</span>
        </Button>
        <Button onClick={() => save.mutate(draft)} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          <span className={cn("ml-1")}>Save settings</span>
        </Button>
      </div>
    </div>
  );
}