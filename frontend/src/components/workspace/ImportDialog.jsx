import { useState } from "react";
import { FileUp, Loader2, AlertCircle, FileText, Layers, FileSpreadsheet, File } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { spacesApi } from "@/services/api-services";

const IMPORT_FORMATS = [
  { id: "obsidian", label: "Obsidian Vault (.zip)", desc: "Folder of .md files", icon: FileText },
  { id: "anki", label: "Anki Deck (.apkg)", desc: "Flashcards from Anki", icon: Layers },
  { id: "notion", label: "Notion Export (.zip)", desc: "CSV + assets from Notion", icon: FileSpreadsheet },
  { id: "pdf", label: "PDF Files", desc: "One or more PDFs", icon: File },
];

function FileDropZone({ onFiles, accept, disabled, children }) {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useState(null);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragActive(false);
  };

  const handleClick = () => inputRef.current?.click();

  const handleChange = (e) => {
    if (e.target.files.length) onFiles(e.target.files);
  };

  return (
    <div
      ref={inputRef}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={handleClick}
      className={cn(
        "relative rounded-xl border-2 p-6 text-center transition-all",
        dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/30",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <input
        type="file"
        ref={inputRef}
        onChange={handleChange}
        accept={accept}
        multiple
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        disabled={disabled}
        aria-label="Choose files"
      />
      <FileUp className="size-10 mx-auto mb-3 text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

/**
 * Summarise what the server reports an import actually created. The counts
 * come from the request that just ran (parsing is synchronous), so this is
 * a report, not an estimate: zero imports is a failure even when files were
 * chosen, and the first server warning (why things were skipped) rides along.
 */
export function describeImport(summary) {
  const { sources = 0, cards = 0, skipped = 0, warnings = [] } = summary ?? {};
  const parts = [];
  if (sources > 0) parts.push(`${sources} source${sources === 1 ? "" : "s"}`);
  if (cards > 0) parts.push(`${cards} card${cards === 1 ? "" : "s"}`);
  const warning = warnings.length > 0 ? warnings[0] : null;
  if (parts.length === 0) {
    const skippedNote = skipped > 0 ? ` (${skipped} skipped)` : "";
    return { ok: false, message: `Nothing was imported${skippedNote}.`, warning };
  }
  const skippedNote = skipped > 0 ? ` (${skipped} skipped)` : "";
  return { ok: true, message: `Imported ${parts.join(" and ")}${skippedNote}`, warning };
}

export default function ImportDialog({ spaceId, open, onClose }) {
  const { success, error } = useToast();
  const [format, setFormat] = useState("obsidian");
  const [files, setFiles] = useState([]);
  const [importing, setImporting] = useState(false);

  const handleFiles = (fileList) => {
    const newFiles = Array.from(fileList).filter((f) => {
      if (files.some((ex) => ex.name === f.name && ex.size === f.size)) return false;
      return true;
    });
    setFiles((prev) => [...prev, ...newFiles]);
  };

  const removeFile = (idx) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const handleImport = async (e) => {
    e.preventDefault();
    if (files.length === 0 || importing) return;
    setImporting(true);

    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f));

      // One synchronous request: the response says what was created, and
      // the dialog repeats exactly that - no counting chosen files.
      const summary = await spacesApi.importBundle(spaceId, format, formData);
      const outcome = describeImport(summary);
      if (outcome.ok) {
        success(outcome.message);
      } else {
        error(outcome.message);
      }
      if (outcome.warning) error(outcome.warning);
      setFiles([]);
      onClose();
    } catch (err) {
      error(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onClose={onClose} title="Import into space" className="max-w-xl p-0">
      <form onSubmit={handleImport} className="p-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          Choose a format and drop files. Importing happens now, so large files can take a moment.
        </p>

        <div className="grid grid-cols-2 gap-2">
          {IMPORT_FORMATS.map((f) => (
            <label
              key={f.id}
              className={cn(
                "relative flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all cursor-pointer",
                format === f.id
                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                  : "border-border hover:border-primary/30"
              )}
            >
              <input
                type="radio"
                name="import-format"
                value={f.id}
                checked={format === f.id}
                onChange={() => setFormat(f.id)}
                className="sr-only"
              />
              <f.icon className="size-6 text-primary" aria-hidden />
              <span className="font-medium text-sm">{f.label}</span>
              <span className="text-xs text-muted-foreground">{f.desc}</span>
            </label>
          ))}
        </div>

        <FileDropZone
          onFiles={handleFiles}
          accept={format === "pdf" ? ".pdf" : ".zip,.apkg,.csv,.md"}
          disabled={importing}
        >
          {files.length > 0
            ? `${files.length} file(s) selected`
            : `Drop ${format === "pdf" ? "PDFs" : "archive files"} here or click to browse`}
        </FileDropZone>

        {files.length > 0 && (
          <div className="max-h-40 overflow-y-auto space-y-1">
            {files.map((f, i) => (
              <div key={i} className="flex items-center justify-between text-sm px-2 py-1 rounded bg-surface-2">
                <span className="truncate flex-1">{f.name}</span>
                <span className="text-xs text-muted-foreground ml-2">{(f.size / 1024).toFixed(1)} KB</span>
                <Button variant="ghost" size="icon" onClick={() => removeFile(i)} aria-label="Remove">
                  <AlertCircle className="size-3 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button variant="outline" type="button" onClick={onClose} disabled={importing} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" disabled={importing || files.length === 0} className="flex-1">
            {importing ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Importing…
              </>
            ) : (
              <>
                <FileUp className="size-4" /> Import {files.length} file(s)
              </>
            )}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}