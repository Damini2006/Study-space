import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, FileText, Layers, ListChecks, Sparkles, Trash2, Move } from "lucide-react";
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

  const handleExport = async (format) => {
    if (!open) return;
    try {
      // Export based on format
      let exportData;
      if (format === "pdf") {
        // Generate and download PDF
        exportData = await studioApi.exportPdf(spaceId, { output_id: open.id });
      } else if (format === "anki") {
        // Generate Anki-compatible format
        exportData = await studioApi.exportAnki(spaceId, { output_id: open.id });
      } else {
        // Default to markdown
        exportData = await studioApi.exportMarkdown(spaceId, { output_id: open.id });
      }
      
      const blob = new Blob([exportData], { type: format === "pdf" ? "application/pdf" : "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${open.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      success(`${format.toUppercase()} exported.`);
    } catch (err) {
      toastError(err.message || "Export failed.");
    }
  };

  const openOutput = openId ? outputs.find((o) => o.id === openId) : null;
  const selectedType = TYPES.find((t) => t.id === type);

  return (
    <section aria-label="Studio" className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <header className="border-b border-border px-3 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Studio</h2>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {openOutput ? (
          <article className="p-3 space-y-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {labelFor(openOutput.type)} · {formatDate(openOutput.created_at)}
                </p>
                <h3 className="truncate text-sm font-semibold">{openOutput.title}</h3>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="icon-sm" onClick={() => remove.mutate(openOutput.id)} aria-label="Delete output" title="Delete">
                  <Trash2 className="size-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setOpenId(null)}>
                  <Move className="size-4" />
                </Button>
                {openOutput.type !== "flashcards" && openOutput.type !== "quiz" && (
                  <Button variant="ghost" size="sm" onClick={() => handleExport("markdown")} aria-label="Export markdown" title="Export as markdown">
                    <FileText className="size-4" />
                  </Button>
                )}
                {openOutput.type !== "quiz" && (
                  <Button variant="ghost" size="sm" onClick={() => handleExport("anki")} aria-label="Export anki" title="Export as Anki cards">
                    <Sparkles className="size-4" />
                  </Button>
                )}
                {!openOutput.type && (
                  <Button variant="ghost" size="sm" onClick={() => handleExport("pdf")} aria-label="Export pdf" title="Export as PDF">
                    <Layers className="size-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Rich editor view based on type */}
            {openOutput.type === "summary" || openOutput.type === "guide" ? (
              <SummaryView output={openOutput} spaceId={spaceId} />
            ) : openOutput.type === "flashcards" ? (
              <FlashcardsView output={openOutput} />
            ) : (
              <QuizView output={openOutput} />
            )}

            {/* Version history section */}
            <div className="mt-4 pt-4 border-t border-border">
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2">Previous versions</h3>
              {isLoading && <div className="skeleton h-6 w-full rounded-lg" />}
              {!isLoading && openOutput.type !== "flashcards" && openOutput.type !== "quiz" && outputs.length > 0 ? (
                <ul className="space-y-1.5" role="list">
                  {outputs
                    .filter((o) => o.id !== openOutput.id)
                    .map((o) => (
                      <li key={o.id} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2/60 px-2 py-1.5 text-left transition-colors hover:border-primary/40">
                        <span className="text-[11px] uppercase tracking-wide text-muted-varphi">{labelFor(o.type)}</span>
                        <span className="min-w-0 flex-1 truncate text-xs font-medium">{o.title}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{formatDate(o.created_at)}</span>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border px-2 py-3 text-center">No previous versions.</p>
              )}
            </div>
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

            <p className="mt-2 text-[11px] text-muted-foreground">{selectedType?.hint}</p>

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
                    <Sparkles className="size-4" /> Generate {selectedType?.label.toLowerCase()}
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

// Summary view with inline editing
function SummaryView({ output, spaceId }) {
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(output?.content?.markdown ?? "");
  const qc = useQueryClient();
  const { error: toastError, success } = useToast();

  const saveEdits = async () => {
    try {
      await studioApi.updateOutput(spaceId, output.id, {
        type: output.type,
        topic: output.topic,
        content: { markdown: content },
      });
      setIsEditing(false);
      success("Summary updated.");
      qc.invalidateQueries({ queryKey: ["studio-outputs", spaceId] });
    } catch (err) {
      toastError(err.message || "Failed to save summary.");
    }
  };

  if (isEditing) {
    return (
      <div className="space-y-2">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={8}
          className="w-full rounded-lg border border-border px-3 py-2 resize-none text-sm text-foreground outline-none bg-surface-2"
        />
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
          <Button type="submit" onClick={saveEdits}>Save changes</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 text-sm" dangerouslySetInnerHTML={{ __html: mdToHtml(content) }} />
  );
}

// Flashcards view
function FlashcardsView({ output }) {
  const cards = output?.content?.cards || [];

  return (
    <ul className="space-y-2" role="list">
      {cards.map((c, i) => (
        <li key={i} className="rounded-lg border border-border bg-surface-2/60 p-2.5">
          <p className="text-xs font-semibold text-muted-foreground">{c.front}</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{c.back}</p>
          {c.source_chunk_id && (
            <button
              type="button"
              onClick={() => window.open(`/spaces/${output.space_id}/studio/${output.id}?card=${i}`, "_blank")}
              className="text-[10px] text-primary hover:underline mt-1 block"
            >
              Open in study
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

// Quiz view
function QuizView({ output }) {
  const questions = output?.content?.questions || [];

  return (
    <ol className="space-y-3" role="list">
      {questions.map((q, i) => (
        <li key={i} className="rounded-lg border border-border bg-surface-2/60 p-2.5">
          <p className="text-xs font-semibold">{i + 1}. {q.question}</p>
          <ul className="mt-1.5 space-y-1" role="list">
            {(q.options || []).map((opt, oi) => (
              <li
                key={oi}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs",
                  q.answer_index === oi ? "border-success/40 bg-success/10 text-foreground" : "border-border text-muted-foreground"
                )}
              >
                {String.fromCharCode(65 + oi)}. {opt}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[10px] text-muted-foreground font-medium">{q.explanation || ""}</p>
        </li>
      ))}
    </ol>
  );
}