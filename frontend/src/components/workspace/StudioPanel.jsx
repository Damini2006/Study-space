/**
 * Studio panel — right pane of the Space workspace.
 * Generates summaries, study guides, flashcards and quizzes from the
 * Space's sources, and lets you browse previous outputs.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, FileText, Layers, ListChecks, Sparkles, Trash2 } from "lucide-react";
import { studioApi } from "@/services/api-services";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatDate, mdToHtml } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

const TYPES = [
  { id: "summary", label: "Summary", icon: FileText, hint: "Concise markdown overview with takeaways." },
  { id: "guide", label: "Guide", icon: BookOpen, hint: "Structured sections with citations." },
  { id: "flashcards", label: "Cards", icon: Layers, hint: "Flashcards that go straight into review." },
  { id: "quiz", label: "Quiz", icon: ListChecks, hint: "Multiple-choice questions to test yourself." },
];

export default function StudioPanel({ spaceId }) {
  const qc = useQueryClient();
  const { error: toastError, success } = useToast();
  const [type, setType] = useState("summary");
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(8);
  const [openId, setOpenId] = useState(null);

  const { data: outputs = [], isLoading } = useQuery({
    queryKey: ["studio-outputs", spaceId],
    queryFn: () => studioApi.listOutputs(spaceId),
  });

  const generate = useMutation({
    mutationFn: () => {
      const body = { type };
      if (topic.trim()) body.topic = topic.trim();
      if (type === "flashcards" || type === "quiz") body.count = Number(count) || 8;
      return studioApi.generate(spaceId, body);
    },
    onSuccess: (out) => {
      success(`${labelFor(type)} generated.`);
      qc.invalidateQueries({ queryKey: ["studio-outputs", spaceId] });
      qc.invalidateQueries({ queryKey: ["spaces", spaceId] });
      setOpenId(out?.id ?? null);
    },
    onError: (e) => toastError(e.message || "Generation failed."),
  });

  const remove = useMutation({
    mutationFn: (id) => studioApi.deleteOutput(spaceId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["studio-outputs", spaceId] });
      if (openId) setOpenId(null);
      success("Output deleted.");
    },
    onError: (e) => toastError(e.message || "Could not delete output."),
  });

  const open = openId ? outputs.find((o) => o.id === openId) : null;
  const selected = TYPES.find((t) => t.id === type);

  return (
    <section aria-label="Studio" className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <header className="border-b border-border px-3 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Studio</h2>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {open ? (
          <article className="p-3">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {labelFor(open.type)} · {formatDate(open.created_at)}
                </p>
                <h3 className="truncate text-sm font-semibold">{open.title}</h3>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="icon-sm" onClick={() => remove.mutate(open.id)} aria-label="Delete output" title="Delete">
                  <Trash2 className="size-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setOpenId(null)}>
                  Back
                </Button>
              </div>
            </div>
            <OutputView output={open} />
          </article>
        ) : (
          <div className="p-3">
            <div className="grid grid-cols-2 gap-1.5">
              {TYPES.map((t) => {
                const Icon = t.icon;
                const active = type === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setType(t.id)}
                    aria-pressed={active}
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition-colors",
                      active ? "border-primary/50 bg-primary/10" : "border-border bg-surface-2/60 hover:border-border"
                    )}
                  >
                    <Icon className={cn("size-4", active ? "text-primary" : "text-muted-foreground")} aria-hidden />
                    <span className="text-xs font-medium">{t.label}</span>
                  </button>
                );
              })}
            </div>

            <p className="mt-2 text-[11px] text-muted-foreground">{selected?.hint}</p>

            <div className="mt-2 space-y-2">
              <label className="block text-[11px] font-medium text-muted-foreground">
                Topic focus (optional)
                <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Cellular respiration" className="mt-1 h-8 text-xs" />
              </label>
              {(type === "flashcards" || type === "quiz") && (
                <label className="block text-[11px] font-medium text-muted-foreground">
                  How many
                  <Input
                    type="number"
                    min={1}
                    max={40}
                    value={count}
                    onChange={(e) => setCount(e.target.value)}
                    className="mt-1 h-8 text-xs"
                  />
                </label>
              )}
              <Button
                variant="gradient"
                size="sm"
                className="w-full"
                onClick={() => generate.mutate()}
                disabled={generate.isPending}
              >
                {generate.isPending ? (
                  <>
                    <Sparkles className="size-4 animate-pulse" /> Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" /> Generate {selected?.label.toLowerCase()}
                  </>
                )}
              </Button>
            </div>

            <div className="mt-4">
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Previous outputs
              </h3>
              {isLoading && <div className="skeleton h-10 w-full rounded-lg" />}
              {!isLoading && outputs.length === 0 && (
                <p className="rounded-lg border border-dashed border-border px-2 py-3 text-center text-[11px] text-muted-foreground">
                  Nothing generated yet.
                </p>
              )}
              <ul className="space-y-1.5" role="list">
                {outputs.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(o.id)}
                      className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface-2/60 px-2 py-1.5 text-left transition-colors hover:border-primary/40"
                    >
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{labelFor(o.type)}</span>
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">{o.title}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{formatDate(o.created_at)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function labelFor(type) {
  return TYPES.find((t) => t.id === type)?.label || type;
}

function OutputView({ output }) {
  const content = output.content;

  if (output.type === "summary" || output.type === "guide") {
    const markdown =
      output.type === "summary"
        ? content?.markdown || ""
        : (content?.sections || [])
            .map((s) => `## ${s.heading}\n\n${s.body}`)
            .join("\n\n");
    return <div className="space-y-2 text-sm" dangerouslySetInnerHTML={{ __html: mdToHtml(markdown) }} />;
  }

  if (output.type === "flashcards") {
    const cards = content?.cards || [];
    return (
      <ul className="space-y-2" role="list">
        {cards.map((c, i) => (
          <li key={i} className="rounded-lg border border-border bg-surface-2/60 p-2.5">
            <p className="text-xs font-semibold">{c.front}</p>
            <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{c.back}</p>
          </li>
        ))}
      </ul>
    );
  }

  const questions = content?.questions || [];
  return (
    <ol className="space-y-3" role="list">
      {questions.map((q, i) => (
        <li key={i} className="rounded-lg border border-border bg-surface-2/60 p-2.5">
          <p className="text-xs font-semibold">
            {i + 1}. {q.question}
          </p>
          <ul className="mt-1.5 space-y-1" role="list">
            {(q.options || []).map((opt, oi) => (
              <li
                key={oi}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs",
                  q.answer === oi || q.answer === opt
                    ? "border-success/40 bg-success/10 text-foreground"
                    : "border-border text-muted-foreground"
                )}
              >
                {String.fromCharCode(65 + oi)}. {opt}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
