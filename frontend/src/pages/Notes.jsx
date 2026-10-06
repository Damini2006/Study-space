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
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/input";
import { notesApi } from "@/services/api-services";
import { useToast } from "@/components/ui/toast";
import { cn, tiptapToText } from "@/lib/utils";
import { EditorContent } from "@tiptap/react";
import { createNoteEditor } from "@/lib/editor";

const COLORS = ["#FFF9B3", "#FFD6A5", "#A0E7E5", "#BDB2FF", "#FFB3D9", "#C6F6D5"];

function NoteCard({ note, onPin, onDelete, onExport }) {
  const preview = tiptapToText(note.content).slice(0, 220);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn("relative p-4 rounded-xl border transition-transform hover:-translate-y-0.5", note.pinned && "ring-2 ring-primary/40")}
      style={{ background: note.color }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className={cn("font-semibold truncate", note.pinned && "text-primary")}>{note.title || "Untitled"}</h4>
          <p className="mt-1 text-sm text-muted-foreground line-clamp-3">{preview || "Empty note"}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {note.tags?.slice(0, 4).map(t => (
              <Badge key={t} variant="default" className="text-[10px]">{t}</Badge>
            ))}
            {note.tags && note.tags.length > 4 && (
              <Badge variant="default" className="text-[10px]">+{note.tags.length - 4}</Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => onPin(note.id, !note.pinned)} className={cn("rounded p-1.5 text-muted-foreground hover:bg-surface-2", note.pinned && "text-primary")} aria-label={note.pinned ? "Unpin" : "Pin"}>
            <Pin className="size-4" />
          </button>
          <button onClick={() => onExport(note)} className="rounded p-1.5 text-muted-foreground hover:bg-surface-2" aria-label="Export">
            <FileText className="size-4" />
          </button>
          <button onClick={() => onDelete(note.id)} className="rounded p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-destructive" aria-label="Delete">
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function NoteEditor({ note, onSave, onClose, allTags }) {
  const [title, setTitle] = useState(note?.title || "");
  const [color, setColor] = useState(note?.color || "#FFF9B3");
  const [noteTags, setNoteTags] = useState(note?.tags || []);
  const [pinned, setPinned] = useState(note?.pinned || false);
  const [content, setContent] = useState(note?.content || { type: "doc", content: [] });
  const [tagInput, setTagInput] = useState("");

  // One TipTap instance per dialog. Constructing it inline during render (as
  // this previously did) allocated a fresh editor on every keystroke.
  const editor = useMemo(
    () =>
      createNoteEditor({
        content: note?.content,
        onUpdate: ({ editor: e }) => setContent(e.getJSON()),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => () => editor.destroy(), [editor]);

  // Live writing stats for the footer, recomputed whenever the doc changes.
  const stats = useMemo(() => {
    const text = (editor.getText?.() || "").trim();
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
      <form onSubmit={e => { e.preventDefault(); onSave({ title, color, content, tags: noteTags, pinned }); }} className="p-4 space-y-4">
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
  const [editingNote, setEditingNote] = useState(null);
  
  const { data: notes = [] } = useQuery({ queryKey: ["notes", { search, tag: tagFilter, sort }], queryFn: () => notesApi.list({ q: search, tag: tagFilter, sort }) });
  
  const allTags = [...new Set(notes.flatMap(n => n.tags))].sort();
  
  const createMutation = useMutation({
    mutationFn: (body) => notesApi.create(body),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["notes"] }); success("Note created."); },
    onError: error,
  });
  
  const updateMutation = useMutation({
    mutationFn: ({ id, body }) => notesApi.update(id, body),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["notes"] }); success("Note updated."); setEditingNote(null); },
    onError: error,
  });
  
  const deleteMutation = useMutation({
    mutationFn: (id) => notesApi.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["notes"] }); success("Note deleted."); },
    onError: error,
  });

  const filtered = notes.filter(n => {
    const matchesSearch = !search || n.title.toLowerCase().includes(search.toLowerCase()) || (tiptapToText(n.content).toLowerCase().includes(search.toLowerCase()));
    const matchesTag = !tagFilter || n.tags?.includes(tagFilter);
    return matchesSearch && matchesTag;
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notes</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Rich-text notes with tags, pinning and search.</p>
        </div>
        <Button onClick={() => setEditingNote(null)}>
          <Plus className="size-4 mr-1" /> New note
        </Button>
      </div>

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

      {filtered.length === 0 ? (
        <Card className="p-8 text-center">
          <FileText className="size-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="text-lg font-semibold">No notes yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {search || tagFilter ? "No notes match your filters." : "Create your first note to get started."}
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filtered.map(note => (
              <NoteCard
                key={note.id}
                note={note}
                onPin={(id, pinned) => updateMutation.mutate({ id, body: { pinned } })}
                onDelete={(id) => { if (confirm("Delete this note?")) deleteMutation.mutate(id); }}
                onExport={(note) => {
                  const blob = new Blob([`${note.title}\n\n${tiptapToText(note.content)}`], { type: "text/plain" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a"); a.href = url; a.download = `${note.title || "note"}.txt`; a.click(); URL.revokeObjectURL(url);
                }}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      <NoteEditor
        note={editingNote}
        allTags={allTags}
        onClose={() => setEditingNote(null)}
        onSave={(body) => {
          if (editingNote) updateMutation.mutate({ id: editingNote.id, body });
          else createMutation.mutate(body);
        }}
      />
    </div>
  );
}