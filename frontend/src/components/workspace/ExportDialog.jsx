import { useState } from "react";
import { Download, FileText, FileSpreadsheet, Layers, ArrowDown, Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { spacesApi } from "@/services/api-services";

const FORMATS = [
  {
    id: "markdown",
    label: "Markdown (.zip)",
    desc: "All sources, notes, and cards as .md files in a zip",
    icon: FileText,
  },
  {
    id: "anki",
    label: "Anki Deck (.apkg)",
    desc: "Flashcards ready to import into Anki",
    icon: Layers,
  },
  {
    id: "notion",
    label: "Notion CSV (.csv)",
    desc: "Notes formatted for Notion import",
    icon: FileSpreadsheet,
  },
  {
    id: "pdf",
    label: "PDF (.pdf)",
    desc: "Printable summary of cards and notes",
    icon: FileText,
  },
];

export default function ExportDialog({ spaceId, spaceTitle, open, onClose }) {
  const { success, error } = useToast();
  const [format, setFormat] = useState("markdown");
  const [exporting, setExporting] = useState(false);

  const handleExport = async (e) => {
    e.preventDefault();
    if (exporting) return;
    setExporting(true);
    try {
      const blob = await spacesApi.export(spaceId, format);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const fmt = FORMATS.find((f) => f.id === format);
      const ext = { markdown: "zip", anki: "apkg", notion: "csv", pdf: "pdf" }[format];
      a.download = `${spaceTitle.replace(/[^a-z0-9]/gi, "_")}-${new Date().toISOString().slice(0, 10)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      success(`${fmt?.label || format} downloaded`);
    } catch (e) {
      error(e.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onClose={onClose} title="Export space" className="max-w-md p-0">
      <form onSubmit={handleExport} className="p-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          Choose a format. Large spaces may take a moment to prepare.
        </p>

        <RadioGroup value={format} onValueChange={setFormat} className="space-y-2">
          {FORMATS.map((f) => (
            <label
              key={f.id}
              className={cn(
                "relative flex items-center gap-3 p-3 rounded-lg border-2 transition-all cursor-pointer",
                format === f.id
                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                  : "border-border hover:border-primary/30"
              )}
            >
              <RadioGroupItem value={f.id} className="sr-only" />
              <f.icon className="size-5 text-primary shrink-0" aria-hidden />
              <div className="flex-1 text-left">
                <div className="font-medium">{f.label}</div>
                <div className="text-xs text-muted-foreground">{f.desc}</div>
              </div>
              <ArrowDown className="size-4 text-muted-foreground" />
            </label>
          ))}
        </RadioGroup>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" type="button" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" disabled={exporting} className="flex-1">
            {exporting ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Preparing…
              </>
            ) : (
              <>
                <Download className="size-4" /> Download
              </>
            )}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}