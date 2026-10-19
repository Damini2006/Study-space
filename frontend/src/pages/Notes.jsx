import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Search,
  Tag,
  Trash2,
  Pin,
  FileText,
  X,
  FolderOpen,
  FolderPlus,
  History,
  Pencil,
  RotateCcw,
  Link2,
  CheckSquare,
  Square,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/input";
import { notesApi } from "@/services/api-services";
import { useToast } from "@/components/ui/toast";
import { cn, formatDate, tiptapToText } from "@/lib/utils";
import { downloadBlob } from "@/lib/export-file";
import { EditorContent } from "@tiptap/react";
import { createNoteEditor } from "@/lib/editor";

const COLORS = ["#FFF9B3", "#FFD6A5", "#A0E7E5", "#BDB2FF", "#FFB3D9", "#C6F6D5"];

function NoteCard({ note, selected, onToggle, onOpen, onPin, onDelete, onExport }) {
  const preview = tiptapToText(note.content).slice(0, 220);
  const contentText = note.content_text || (note.content ? tiptapToText(note.content).slice(0, 120) : "Empty note");
  const meta = [
    note.tags?.slice(0, 4).map(t => (
      <Badge key={t} variant="default" className="text-[10px]">{t}</Badge>
    )),
    note.tags && note.tags.length > 4 && (
      <Badge variant="default" className="text-[10px]">+{note.tags.length - 4}</Badge>
    ),
    note.space_id && <span className="text-[10px] text-muted-foreground">Space: {note.space_id}</span>,
    note.created_at && <span className="text-[10px] text-muted-foreground">Created: {formatDate(note.created_at)}</span>,
    contentText ? <span className="text-[10px] text-muted-foreground">{contentText}</span> : null,
  ].filter(Boolean);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        "relative p-4 rounded-xl border transition-transform hover:-translate-y-0.5",
        note.pinned && "ring-2 ring-primary/40",
        selected && "ring-2 ring-primary"
      )}
      style={{ background: note.color }}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => onOpen(note)}
          aria-label={`Edit ${note.title || "Untitled"}`}
          className="min-w-0 flex-1 rounded text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          <h4 className={cn("font-semibold truncate", note.pinned && "text-primary")}>{note.title || "Untitled"}</h4>
          <p className="mt-1 text-sm text-muted-foreground line-clamp-3">{preview || "Empty note"}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {meta}
        </div>
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(note.id); }}
            className="rounded p-1.5 text-muted-foreground hover:bg-surface-2"
            aria-label={selected ? "Deselect note" : "Select note"}
            aria-pressed={selected}
          >
            {selected ? <CheckSquare className="size-4 text-primary" /> : <Square className="size-4" />}
          </button>
          <button onClick={(e) => { e.stopPropagation(); onPin(note.id, !note.pinned); }} className={cn("rounded p-1.5 text-muted-foreground hover:bg-surface-2", note.pinned && "text-primary")} aria-label={note.pinned ? "Unpin" : "Pin"}>
            <Pin className="size-4" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onExport(note); }} className="rounded p-1.5 text-muted-foreground hover:bg-surface-2" aria-label="Export">
            <FileText className="size-4" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(note.id); }} className="rounded p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-destructive" aria-label="Delete">
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function NoteEditor({ note, onSave, onClose, allTags, folderId }) {
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(note?.title || "");
  const [color, setColor] = useState(note?.color || "#FFF9B3");
  const [noteTags, setNoteTags] = useState(note?.tags || []);
  const [pinned, setPinned] = useState(note?.pinned || false);
  const [tagInput, setTagInput] = useState("");

  const [content, setContent] = useState(note?.content || { type: "doc", content: [] });

  // One TipTap instance per dialog, built inside an effect rather than during
  // render. Constructing it inline (as this previously did) allocated a fresh
  // editor on every keystroke; moving it to `useMemo` still failed under
  // Strict Mode, whose simulated unmount runs the cleanup below and destroys
  // the editor — while `EditorContent` never re-initialises an instance it
  // saw destroyed, so the document rendered blank and could not be typed
  // into. Creating it on every mount means Strict Mode's throwaway copy is
  // simply replaced by a live one.
  const [editor, setEditor] = useState(null);
  useEffect(() => {
    const instance = createNoteEditor({
      content: note?.content,
      onUpdate: ({ editor: e }) => setContent(e.getJSON()),
    });
    setEditor(instance);
    return () => instance.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Version history and related notes are only meaningful for a
  // saved note — a brand-new one has neither.
  const isExisting = Boolean(note?.id);
  const { data: versions = [] } = useQuery({
    queryKey: ["note-versions", note?.id],
    queryFn: () => notesApi.versions(note.id),
    enabled: isExisting,
  });
  const { data: related = [] } = useQuery({
    queryKey: ["note-related", note?.id],
    queryFn: () => notesApi.related(note.id),
    enabled: isExisting,
  });

  const restoreMutation = useMutation({
    mutationFn: (versionId) => notesApi.restore(note.id, versionId),
    onSuccess: (restored) => {
      // Reflect the restored state in the editor so the user
      // sees exactly what came back.
      setTitle(restored.title);
      setColor(restored.color);
      setNoteTags(restored.tags || []);
      setPinned(restored.pinned);
      // The editor is built on mount, so it is always here by the time a
      // restore can run; the guard keeps the call safe regardless.
      editor?.commands?.setContent(restored.content);
      setContent(restored.content);
      queryClient.invalidateQueries({ queryKey: ["note-versions", note.id] });
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      success("Version restored.");
    },
    onError: error,
  });

  // Live writing stats for the footer, recomputed whenever the doc changes.
  const stats = useMemo(() => {
    const text = (editor?.getText?.() || "").trim();
    const words = text ? text.split(/\s+/).length : 0;
    return {
      words,
      chars: text.length,
      readMin: Math.max(1, Math.round(words / 220)),
    };
    // `content` isn't read here — TipTap owns the document — but it is the only
    // signal that the text changed, so it must trigger the recompute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, content]);

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !noteTags.includes(t)) setNoteTags([...noteTags, t]);
    setTagInput("");
  };

  return (
    <Dialog open onClose={onClose} title={note ? "Edit note" : "New note"} className="max-w-3xl p-0">
      <form onSubmit={e => { e.preventDefault(); onSave({ title, color, content, tags: noteTags, pinned, folder_id: folderId || undefined }); }} className="p-4 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Note title" autoFocus />
        </div>

        <div className="space-y-1.5">
          <Label>Tags</Label>
          <div className="flex flex-wrap gap-1.5">
            {noteTags.map(t => (
              <Badge key={t} variant="default" className="flex items-center gap-1">
                {t} <button type="button" onClick={() => setNoteTags(noteTags.filter(x => x !== t))}><X className="size-3" /></button>
              </Badge>
            ))}
            <div className="flex items-center gap-1">
              <Input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addTag())} placeholder="Add tag" style={{ width: "160px" }} />
            </div>
            <div className="flex flex-wrap gap-1">
              {allTags.filter(t => !noteTags.includes(t)).slice(0, 10).map(t => (
                <button key={t} type="button" onClick={() => setNoteTags([...noteTags, t])} className="rounded px-2 py-0.5 text-xs border border-border hover:bg-surface-2">{t}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Color</Label>
          <div className="flex gap-2">
            {COLORS.map(c => (
              <button key={c} type="button" onClick={() => setColor(c)} aria-pressed={color === c} className={cn("size-8 rounded-full border-2", color === c && "border-foreground")} style={{ background: c }} />
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="note-content">Content</Label>
          <EditorContent
            id="note-content"
            editor={editor}
            className="min-h-[240px] rounded-lg border border-border bg-surface p-3 prose prose-sm max-w-none focus-within:ring-2 focus-within:ring-ring"
          />
          <div
            aria-live="polite"
            className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground"
          >
            <span>{stats.words} words</span>
            <span aria-hidden className="text-border">·</span>
            <span>{stats.chars} characters</span>
            <span aria-hidden className="text-border">·</span>
            <span>~{stats.readMin} min read</span>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} className="size-4 accent-primary" />
          <span>Pinned</span>
        </label>

        {/* Version history — the snapshots the server keeps on every edit */}
        {isExisting && (
          <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <History className="size-4" /> Version history
            </div>
            {versions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No earlier versions yet. Each save records one.</p>
            ) : (
              <ul className="space-y-1.5">
                {versions.map(v => (
                  <li key={v.id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-2.5 py-1.5">
                    <div className="min-w-0">
                      <div className="truncate text-sm">{v.title || "Untitled"}</div>
                      {/* Two saves on the same day otherwise look identical, so
                          the row leads with a line of what that version
                          actually said. */}
                      <div className="truncate text-[11px] text-muted-foreground">
                        {formatDate(v.created_at)}
                        {" — "}
                        {(v.content_text || "").trim().replace(/\s+/g, " ") || "No text"}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (confirm("Restore this version? Your current text is saved as a new version first.")) {
                          restoreMutation.mutate(v.id);
                        }
                      }}
                      disabled={restoreMutation.isPending}
                    >
                      <RotateCcw className="size-3.5 mr-1" /> Restore
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Related notes — others sharing a tag */}
        {isExisting && (
          <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Link2 className="size-4" /> Related notes
            </div>
            {related.length === 0 ? (
              <p className="text-xs text-muted-foreground">No other notes share a tag with this one.</p>
            ) : (
              <ul className="space-y-1.5">
                {related.map(r => (
                  <li key={r.id} className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm">{r.title || "Untitled"}</span>
                    <span className="text-[11px] text-muted-foreground">{(r.tags || []).slice(0, 3).join(", ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save note</Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function Notes() {
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [sort, setSort] = useState("updated");
  const [folderId, setFolderId] = useState(null);
  const [spaceId, _setSpaceId] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [editingNote, setEditingNote] = useState(null);
  // Separate from `editingNote`, because they used to be the same variable
  // and could not be told apart: `null` meant both "a new note" and "nothing
  // open", so the dialog was mounted on arrival and onClose wrote back the
  // value already in state — Cancel, the X, the backdrop and Escape all left
  // it on screen. Only this flag decides whether the editor is mounted, which
  // means its fields start empty on every open rather than keeping the last
  // note's title.
  const [editorOpen, setEditorOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [moveTarget, setMoveTarget] = useState("");

  // Keyboard shortcuts: "n" opens a new note, Escape closes the editor
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "Escape") setEditorOpen(false);
      if (e.key === "n" && !e.metaKey && !e.ctrlKey) {
        setEditingNote(null);
        setEditorOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const { data: notes = [] } = useQuery({ queryKey: ["notes", { search, tag: tagFilter, sort, folderId, spaceId }], queryFn: () => notesApi.list({ q: search, tag: tagFilter, sort, folder_id: folderId, space_id: spaceId }) });

  const { data: folders = [] } = useQuery({ queryKey: ["note-folders"], queryFn: () => notesApi.folders.list() });

  const allTags = [...new Set(notes.flatMap(n => n.tags))].sort();

  const createMutation = useMutation({
    mutationFn: (body) => notesApi.create(body),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["notes"] }); success("Note created."); setEditorOpen(false); },
    onError: error,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }) => notesApi.update(id, body),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["notes"] }); success("Note updated."); setEditorOpen(false); },
    onError: error,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => notesApi.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["notes"] }); success("Note deleted."); },
    onError: error,
  });

  // Bulk operations on the selected set.
  const bulkDelete = useMutation({
    mutationFn: (ids) => notesApi.bulk({ action: "delete", ids }),
    onSuccess: (_data, ids) => {
      setSelected(() => new Set());
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      success(`Deleted ${ids.length} note(s).`);
    },
    onError: error,
  });

  const bulkPin = useMutation({
    mutationFn: ({ ids, pinned }) => notesApi.bulk({ action: "pin", ids, pinned }),
    onSuccess: (_data, { ids, pinned }) => {
      setSelected(() => new Set());
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      success(pinned ? `Pinned ${ids.length} note(s).` : `Unpinned ${ids.length} note(s).`);
    },
    onError: error,
  });

  const bulkMove = useMutation({
    mutationFn: ({ ids, folderId: target }) => notesApi.bulk({ action: "move", ids, folder_id: target }),
    onSuccess: (_data, { ids, folderId: target }) => {
      setSelected(() => new Set());
      setMoveTarget("");
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      const name = folders.find(f => f.id === target)?.name || "a folder";
      success(`Moved ${ids.length} note(s) to ${name}.`);
    },
    onError: error,
  });

  const createFolder = useMutation({
    mutationFn: (name) => notesApi.folders.create({ name }),
    onSuccess: () => {
      setNewFolderName("");
      queryClient.invalidateQueries({ queryKey: ["note-folders"] });
      success("Folder created.");
    },
    onError: error,
  });

  const renameFolder = useMutation({
    mutationFn: ({ id, name }) => notesApi.folders.rename(id, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["note-folders"] });
      success("Folder renamed.");
    },
    onError: error,
  });

  const deleteFolder = useMutation({
    mutationFn: (id) => notesApi.folders.delete(id),
    onSuccess: () => {
      if (folderId === id) setFolderId(null); // eslint-disable-line no-undef
      queryClient.invalidateQueries({ queryKey: ["note-folders"] });
      success("Folder deleted. Its notes were kept.");
    },
    onError: error,
  });

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportSelected = () => {
    const chosen = notes.filter(n => selected.has(n.id));
    if (chosen.length === 0) return;
    const text = chosen
      .map(n => `${n.title || "Untitled"}\n${"=".repeat(30)}\n\n${tiptapToText(n.content)}`)
      .join("\n\n\n");
    downloadBlob(new Blob([text], { type: "text/plain" }), "notes-export.txt");
    success(`Exported ${chosen.length} note(s).`);
  };

  const anyPinned = notes.filter(n => selected.has(n.id)).some(n => n.pinned);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notes</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Rich-text notes with folders, tags, pinning and search.</p>
        </div>
        <Button onClick={() => { setEditingNote(null); setEditorOpen(true); }}>
          <Plus className="size-4 mr-1" /> New note
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        {/* Folder sidebar */}
        <Card className="p-3 self-start">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <FolderOpen className="size-4" /> Folders
            </span>
          </div>
          <button
            type="button"
            onClick={() => setFolderId(null)}
            className={cn(
              "mt-2 flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm",
              folderId === null ? "bg-primary/10 text-primary" : "hover:bg-surface-2"
            )}
            aria-pressed={folderId === null}
          >
            <span>All notes</span>
            <span className="text-xs text-muted-foreground">{notes.length || ""}</span>
          </button>
          <ul className="mt-1 space-y-0.5">
            {folders.map(f => (
              <li key={f.id} className="group flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setFolderId(f.id === folderId ? null : f.id)}
                  className={cn(
                    "min-w-0 flex-1 truncate rounded-lg px-2.5 py-1.5 text-left text-sm",
                    folderId === f.id ? "bg-primary/10 text-primary" : "hover:bg-surface-2"
                  )}
                  aria-pressed={folderId === f.id}
                >
                  <span className="mr-2">{f.name}</span>
                  <span className="text-xs text-muted-foreground">{f.note_count}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const name = prompt("Rename folder", f.name);
                    const trimmed = name?.trim();
                    if (trimmed && trimmed !== f.name) renameFolder.mutate({ id: f.id, name: trimmed });
                  }}
                  className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-surface-2 group-hover:opacity-100"
                  aria-label={`Rename ${f.name}`}
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Delete folder "${f.name}"? Its notes are kept.`)) {
                      deleteFolder.mutate(f.id);
                    }
                  }}
                  className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-surface-2 hover:text-destructive group-hover:opacity-100"
                  aria-label={`Delete ${f.name}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <form
            className="mt-3 flex gap-1.5"
            onSubmit={e => {
              e.preventDefault();
              const name = newFolderName.trim();
              if (name) createFolder.mutate(name);
            }}
          >
            <Input
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              placeholder="New folder"
              aria-label="New folder name"
              className="h-8 text-sm"
            />
            <Button type="submit" size="sm" variant="outline" disabled={!newFolderName.trim() || createFolder.isPending}>
              <FolderPlus className="size-4" />
            </Button>
          </form>
          {folders.length > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Click a folder to filter. Deleting a folder keeps its notes.
            </p>
          )}
        </Card>

        <div className="min-w-0 space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder="Search notes…" value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder="Filter by tag" value={tagFilter} onChange={e => setTagFilter(e.target.value)} className="pl-10 w-48" />
            </div>
            <select value={sort} onChange={e => setSort(e.target.value)} className="rounded-lg border border-input bg-surface px-3 py-2 text-sm">
              <option value="updated">Newest</option>
              <option value="created">Oldest</option>
              <option value="pinned">Pinned</option>
            </select>
          </div>

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <Card className="flex flex-wrap items-center gap-2 p-3" aria-live="polite">
              <span className="text-sm font-medium">{selected.size} selected</span>
              <Button size="sm" variant="outline" onClick={() => bulkPin.mutate({ ids: [...selected], pinned: !anyPinned })}>
                <Pin className="size-3.5 mr-1" /> {anyPinned ? "Unpin" : "Pin"}
              </Button>
              <div className="flex items-center gap-1.5">
                <Label htmlFor="move-to" className="text-sm">Move to</Label>
                <select
                  id="move-to"
                  value={moveTarget}
                  onChange={e => setMoveTarget(e.target.value)}
                  className="rounded-lg border border-input bg-surface px-2 py-1.5 text-sm"
                >
                  <option value="">Select folder…</option>
                  {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  <option value="null">Move to no folder</option>
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!moveTarget}
                  onClick={() => bulkMove.mutate({ ids: [...selected], folderId: moveTarget === "null" ? null : moveTarget })}
                >
                  Move
                </Button>
              </div>
              <Button size="sm" variant="outline" onClick={exportSelected}>
                <FileText className="size-3.5 mr-1" /> Export
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  if (confirm(`Delete ${selected.size} note(s)? This cannot be undone.`)) {
                    bulkDelete.mutate([...selected]);
                  }
                }}
              >
                <Trash2 className="size-3.5 mr-1" /> Delete
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(() => new Set())}>
                Clear
              </Button>
            </Card>
          )}

          {notes.length === 0 ? (
            <Card className="p-8 text-center">
              <FileText className="size-12 mx-auto text-muted-foreground mb-3" />
              <h3 className="text-lg font-semibold">No notes yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {search || tagFilter ? "No notes match your filters." : "Create your first note to get started."}
              </p>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <AnimatePresence mode="popLayout">
                {notes.map(note => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    selected={selected.has(note.id)}
                    onToggle={toggleSelect}
                    onOpen={(note) => { setEditingNote(note); setEditorOpen(true); }}
                    onPin={(id, pinned) => updateMutation.mutate({ id, body: { pinned } })}
                    onDelete={(id) => { if (confirm("Delete this note?")) deleteMutation.mutate(id); }}
                    onExport={(note) => {
                      downloadBlob(
                        new Blob([`${note.title}\n\n${tiptapToText(note.content)}`], { type: "text/plain" }),
                        `${note.title || "note"}.txt`
                      );
                    }}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {editorOpen && (
        <NoteEditor
          note={editingNote}
          allTags={allTags}
          onClose={() => setEditorOpen(false)}
          onSave={(body) => {
            if (editingNote) updateMutation.mutate({ id: editingNote.id, body });
            else createMutation.mutate(body);
          }}
          folderId={folderId}
/>
      )}
    </div>
  );
}
