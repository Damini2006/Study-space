/**
 * Per-space RAG tuning — retrieval weights, reranking, the three safety layers
 * and generation knobs.
 *
 * Changes are staged locally and committed on an explicit Save, so dragging a
 * slider doesn't fire a PATCH per frame. Each control is annotated with whether
 * it's the global default or a per-space override, because "I changed this and
 * nothing happened" usually means the value was already what the space had.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { modelsApi, ragApi } from "@/services/api-services";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { Switch, Select } from "@/components/ui/dialog";
import { Loader2, RotateCcw, Save, SlidersHorizontal } from "lucide-react";

const PRESETS = {
  balanced: {
    label: "Balanced",
    hint: "Good all-round default.",
    values: {
      top_k: 12, vector_weight: 0.7, fts_weight: 0.3,
      rerank_enabled: true, rerank_top_n: 8,
      relevance_gate: true, relevance_threshold: 0.35,
      citation_validation: true, claim_verification: true,
      temperature: 0.3, socratic_mode: false,
    },
  },
  precise: {
    label: "Precise",
    hint: "Fewer passages, higher bar. Fewer wrong answers, more abstentions.",
    values: {
      top_k: 8, vector_weight: 0.85, fts_weight: 0.15,
      rerank_enabled: true, rerank_top_n: 6,
      relevance_gate: true, relevance_threshold: 0.55,
      citation_validation: true, claim_verification: true,
      temperature: 0.1, socratic_mode: false,
    },
  },
  exploratory: {
    label: "Exploratory",
    hint: "Wide recall, no gate. Good when you're learning a new topic.",
    values: {
      top_k: 20, vector_weight: 0.5, fts_weight: 0.5,
      rerank_enabled: true, rerank_top_n: 12,
      relevance_gate: false, relevance_threshold: 0.2,
      citation_validation: true, claim_verification: false,
      temperature: 0.7, socratic_mode: false,
    },
  },
  socratic: {
    label: "Socratic",
    hint: "The tutor guides you to the answer instead of giving it.",
    values: {
      top_k: 10, vector_weight: 0.7, fts_weight: 0.3,
      rerank_enabled: true, rerank_top_n: 8,
      relevance_gate: true, relevance_threshold: 0.35,
      citation_validation: true, claim_verification: false,
      temperature: 0.4, socratic_mode: true,
    },
  },
};

const TASK_MODELS = {
  chat_model: "Chat answers",
  generate_model: "Studio generation",
  judge_model: "Claim verification",
};

/**
 * A labelled range input that marks itself when it differs from the space's
 * saved value, so overrides are visible rather than mysterious.
 */
function Slider({ id, label, hint, value, onChange, min, max, step, overridden }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id} className="flex items-center gap-1.5">
          {label}
          {overridden ? (
            <span className="rounded bg-primary/10 px-1 py-0.5 text-[10px] font-semibold uppercase text-primary">
              overridden
            </span>
          ) : null}
        </Label>
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
        aria-describedby={hint ? `${id}_hint` : undefined}
      />
      {hint ? (
        <p id={`${id}_hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function LayerSwitch({ id, label, description, checked, onChange, overridden }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border px-3 py-2">
      <div className="min-w-0">
        <Label htmlFor={id} className="flex items-center gap-1.5">
          {label}
          {overridden ? (
            <span className="rounded bg-primary/10 px-1 py-0.5 text-[10px] font-semibold uppercase text-primary">
              overridden
            </span>
          ) : null}
        </Label>
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
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => ragApi.getSettings(spaceId),
    enabled: Boolean(spaceId),
  });

  const { data: catalog } = useQuery({
    queryKey: ["models", "catalog"],
    queryFn: modelsApi.catalog,
    staleTime: 10 * 60_000,
  });

  // The API returns { resolved, overridden, is_default }; keep only the values
  // and derive "is this an override" by diffing against the server's own answer
  // rather than guessing locally.
  const saved = data?.resolved ?? null;
  const overriddenFields = useMemo(
    () => new Set(data?.overridden ?? []),
    [data]
  );

  // Reset the draft when the space changes or the server row is refetched.
  useEffect(() => {
    setDraft(saved);
  }, [saved]);

  const chatModels = useMemo(
    () => Object.values(catalog?.models ?? {}).flat(),
    [catalog]
  );

  const save = useMutation({
    mutationFn: (payload) => ragApi.updateSettings(spaceId, payload),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKey, result);
      queryClient.invalidateQueries({ queryKey });
      success("RAG settings saved.");
    },
    onError: error,
  });

  const reset = useMutation({
    mutationFn: () => ragApi.resetSettings(spaceId),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKey, result);
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

  // Only send fields the user actually touched, so a PATCH never rewrites a
  // column the panel doesn't manage (rerank_model, rrf_k).
  const diff = {};
  for (const key of Object.keys(draft)) {
    if (key !== "space_id" && draft[key] !== saved?.[key]) diff[key] = draft[key];
  }
  const dirty = Object.keys(diff).length > 0;

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="size-4 text-primary" />
            <h3 className="font-semibold">Retrieval</h3>
          </div>
          {data?.is_default ? (
            <p className="text-xs text-muted-foreground">Using global defaults</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {overriddenFields.size} field{overriddenFields.size === 1 ? "" : "s"} overridden
            </p>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Hybrid search blends the vector index with full-text search, then fuses and reranks the
          results.
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
            overridden={overriddenFields.has("top_k")}
          />
          <Slider
            id="vector_weight"
            label="Vector weight"
            hint="Share of the fusion score from semantic similarity."
            value={draft.vector_weight}
            onChange={(v) => set("vector_weight", v)}
            min={0.05}
            max={1}
            step={0.05}
            overridden={overriddenFields.has("vector_weight")}
          />
          <Slider
            id="fts_weight"
            label="Full-text weight"
            hint="Share of the fusion score from keyword matching."
            value={draft.fts_weight}
            onChange={(v) => set("fts_weight", v)}
            min={0.05}
            max={1}
            step={0.05}
            overridden={overriddenFields.has("fts_weight")}
          />
          <Slider
            id="rerank_top_n"
            label="Rerank depth"
            hint="Candidates handed to the reranker before the top-K is cut."
            value={draft.rerank_top_n}
            onChange={(v) => set("rerank_top_n", v)}
            min={1}
            max={20}
            step={1}
            overridden={overriddenFields.has("rerank_top_n")}
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
            description="Rescore the top candidates before they reach the model."
            checked={draft.rerank_enabled}
            onChange={(v) => set("rerank_enabled", v)}
            overridden={overriddenFields.has("rerank_enabled")}
          />
          <LayerSwitch
            id="relevance_gate"
            label="Relevance gate"
            description="Refuse to answer when the best evidence is too weak."
            checked={draft.relevance_gate}
            onChange={(v) => set("relevance_gate", v)}
            overridden={overriddenFields.has("relevance_gate")}
          />
          <LayerSwitch
            id="citation_validation"
            label="Citation validation"
            description="Every [n] in the answer must map to a retrieved passage."
            checked={draft.citation_validation}
            onChange={(v) => set("citation_validation", v)}
            overridden={overriddenFields.has("citation_validation")}
          />
          <LayerSwitch
            id="claim_verification"
            label="Claim verification"
            description="Check each sentence against the passage it cites."
            checked={draft.claim_verification}
            onChange={(v) => set("claim_verification", v)}
            overridden={overriddenFields.has("claim_verification")}
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
            overridden={overriddenFields.has("relevance_threshold")}
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
            overridden={overriddenFields.has("temperature")}
          />
          <Slider
            id="max_tokens"
            label="Max tokens"
            value={draft.max_tokens}
            onChange={(v) => set("max_tokens", v)}
            min={256}
            max={8192}
            step={256}
            overridden={overriddenFields.has("max_tokens")}
          />
        </div>
        <LayerSwitch
          id="socratic_mode"
          label="Socratic mode"
          description="Answer with guiding questions instead of the final answer."
          checked={draft.socratic_mode}
          onChange={(v) => set("socratic_mode", v)}
          overridden={overriddenFields.has("socratic_mode")}
        />
        <div className="grid gap-3 pt-1 sm:grid-cols-3">
          {Object.entries(TASK_MODELS).map(([key, label]) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`model_${key}`}>{label}</Label>
              <Select
                id={`model_${key}`}
                value={draft[key] ?? ""}
                onValueChange={(v) => set(key, v || null)}
                placeholder="Deployment default"
                options={[
                  { value: "", label: "Deployment default" },
                  ...chatModels.map((m) => ({ value: m.id, label: m.display_name })),
                ]}
              />
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="font-semibold">Presets</h3>
        <p className="text-sm text-muted-foreground">Start from a known-good configuration.</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(PRESETS).map(([name, preset]) => (
            <Button
              key={name}
              variant="outline"
              size="sm"
              title={preset.hint}
              onClick={() => setDraft((d) => ({ ...d, ...preset.values }))}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="ghost"
          onClick={() => reset.mutate()}
          disabled={reset.isPending || data?.is_default}
        >
          {reset.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RotateCcw className="size-4" />
          )}
          <span className="ml-1">Revert to globals</span>
        </Button>
        <Button onClick={() => save.mutate(diff)} disabled={!dirty || save.isPending}>
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          <span className="ml-1">
            {dirty ? `Save ${Object.keys(diff).length} change${Object.keys(diff).length === 1 ? "" : "s"}` : "No changes"}
          </span>
        </Button>
      </div>
    </div>
  );
}
