/**
 * Sources panel — the left pane of the Space workspace.
 * Upload files, paste text, watch ingestion status, delete sources.
 * Search asks the hybrid retrieval endpoint which chunks of this
 * space's sources mention something; a clicked result is surfaced as
 * the selected passage, the same slot chat citations fill.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { sourcesApi } from "@/services/api-services";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { SourceStatusBadge } from "@/components/ui/status-badges";
import { debounce, formatBytes, formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

/** Below this many characters a search stays local: one character matches almost everything. */
const MIN_QUERY = 2;

export default function SourcesPanel({
  spaceId,
  selectedPassage,
  onClearPassage,
  onSelectPassage,
  onSourceChanged,
}) {
  const qc = useQueryClient();
  const { error: toastError, success } = useToast();
  const fileRef = useRef(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [term, setTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const setTermDebounced = useMemo(() => debounce(setDebouncedTerm, 300), []);
  useEffect(() => {
    setTermDebounced(term.trim());
  }, [term, setTermDebounced]);

  const searching = debouncedTerm.length >= MIN_QUERY;
  const {
    data: hits,
    isLoading: searchLoading,
    isError: searchFailed,
  } = useQuery({
    queryKey: ["source-search", spaceId, debouncedTerm],
    queryFn: () => sourcesApi.search(spaceId, debouncedTerm),
    enabled: searching,
  });

  const { data: sources = [], isLoading } = useQuery({
    queryKey: ["sources", spaceId],
    queryFn: () => sourcesApi.list(spaceId),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["sources", spaceId] });
    qc.invalidateQueries({ queryKey: ["spaces", spaceId] });
    onSourceChanged?.();
  };

  const uploadMutation = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append("file", file);
      return sourcesApi.upload(spaceId, fd);
    },
    onSuccess: () => {
      success("Upload queued — indexing will start shortly.");
      invalidate();
    },
    onError: (e) => toastError(e.message || "Upload failed."),
  });

  const pasteMutation = useMutation({
    mutationFn: () => sourcesApi.addPasted(spaceId, { title: pasteTitle.trim() || "Untitled note", content: pasteText }),
    onSuccess: () => {
      success("Text added to this Space.");
      setPasteOpen(false);
      setPasteTitle("");
      setPasteText("");
      invalidate();
    },
    onError: (e) => toastError(e.message || "Could not add text."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => sourcesApi.delete(spaceId, id),
    onSuccess: () => {
      success("Source removed.");
      invalidate();
    },
    onError: (e) => toastError(e.message || "Could not delete source."),
  });

  const onFiles = (e) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
    e.target.value = "";
  };

  return (
    <section
      aria-label="Sources"
      className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card"
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sources</h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Paste text" title="Paste text" onClick={() => setPasteOpen(true)}>
            <Plus className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Upload a file"
            title="Upload a file"
            onClick={() => fileRef.current?.click()}
            disabled={uploadMutation.isPending}
          >
            <Upload className="size-4" />
          </Button>
        </div>
      </header>

      <div className="border-b border-border px-3 py-2">
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search this space's sources…"
          aria-label="Search this space's sources"
          className="h-8 text-sm"
        />
      </div>

      <input ref={fileRef} type="file" className="hidden" onChange={onFiles} aria-hidden tabIndex={-1} />

      {selectedPassage && (
        <div className="m-2 rounded-lg border border-primary/30 bg-primary/5 p-2 text-xs">
          <div className="mb-1 flex items-start justify-between gap-2">
            <span className="font-medium">{selectedPassage.source_title || "Cited passage"}</span>
            <button type="button" onClick={onClearPassage} aria-label="Clear highlighted passage" className="text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </button>
          </div>
          <p className="line-clamp-4 text-muted-foreground">{selectedPassage.quote || selectedPassage.snippet}</p>
          {selectedPassage.page != null && (
            <p className="mt-1 text-[11px] text-muted-foreground">Page {selectedPassage.page}</p>
          )}
        </div>
      )}

      {searching ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 scrollbar-thin">
          {searchLoading && (
            <div className="space-y-2 p-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-12 w-full rounded-lg" />
              ))}
            </div>
          )}

          {!searchLoading && searchFailed && (
            <p className="px-2 py-6 text-center text-xs text-destructive">
              Search did not go through. Try again.
            </p>
          )}

          {!searchLoading && !searchFailed && hits?.results?.length === 0 && (
            <div className="flex flex-col items-center gap-1 px-4 py-8 text-center">
              <Search className="size-5 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium">No matches for “{debouncedTerm}”</p>
              <p className="text-xs text-muted-foreground">
                Search reads the text of this space's sources. Try different words, or
                wait for indexing to finish.
              </p>
            </div>
          )}

          {!searchLoading && !searchFailed && (hits?.results?.length ?? 0) > 0 && (
            <ul className="space-y-1.5" role="list">
              {hits.results.map((r) => (
                <li key={r.chunk_id} className="rounded-lg border border-border bg-surface-2/60 p-2">
                  <button
                    type="button"
                    onClick={() =>
                      onSelectPassage?.({
                        source_id: r.source_id,
                        source_title: r.source_title,
                        quote: r.content,
                        page: r.page,
                      })
                    }
                    className="w-full cursor-pointer text-left"
                    title="Show this passage"
                  >
                    <p className="truncate text-sm font-medium" title={r.source_title}>
                      {r.source_title}
                      {r.page != null && (
                        <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                          p. {r.page}
                        </span>
                      )}
                    </p>
                    <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{r.content}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 scrollbar-thin">
        {isLoading && (
          <div className="space-y-2 p-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-12 w-full rounded-lg" />
            ))}
          </div>
        )}

        {!isLoading && sources.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <FileText className="size-6 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">No sources yet</p>
            <p className="text-xs text-muted-foreground">
              Upload a file, or paste text so the assistant has something to work with.
            </p>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="size-4" /> Upload file
            </Button>
          </div>
        )}

        <ul className="space-y-1.5" role="list">
          {sources.map((s) => (
            <li
              key={s.id}
              className="group rounded-lg border border-border bg-surface-2/60 p-2 transition-colors hover:border-border"
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={s.title}>
                    {s.title}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <SourceStatusBadge status={s.status} />
                    <span>{formatBytes(s.size_bytes)}</span>
                    {s.chunk_count > 0 && <span>{s.chunk_count} chunks</span>}
                    <span>{formatDate(s.created_at)}</span>
                  </div>
                  {s.status === "failed" && s.error && (
                    <p className="mt-1 text-[11px] text-destructive">{s.error}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(s.id)}
                  aria-label={`Delete ${s.title}`}
                  title="Delete source"
                  className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-danger-bg hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      )}

      <Dialog
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        title="Paste text"
        description="Add notes, an article body, or any text you want the assistant to use."
        footer={
          <>
            <Button variant="outline" onClick={() => setPasteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => pasteMutation.mutate()} disabled={!pasteText.trim() || pasteMutation.isPending}>
              {pasteMutation.isPending ? "Adding…" : "Add text"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block text-xs font-medium text-muted-foreground">
            Title
            <Input
              value={pasteTitle}
              onChange={(e) => setPasteTitle(e.target.value)}
              placeholder="e.g. Lecture 4 notes"
              className="mt-1"
            />
          </label>
          <label className="block text-xs font-medium text-muted-foreground">
            Content
            <Textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste or type your text here…"
              rows={8}
              className="mt-1"
            />
          </label>
        </div>
      </Dialog>
    </section>
  );
}
