import { useState } from "react";
import { Download, FileText, FileSpreadsheet, Layers, ArrowDown, Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { downloadBlob, exportFilename } from "@/lib/export-file";
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
    label: "Print / Save as PDF",
    desc: 'Opens a print-ready page — choose "Save as PDF" in the print dialog',
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
    const fmt = FORMATS.find((f) => f.id === format);
    // Popup blockers reject window.open() after an await, so the print
    // window opens while the click is still the active user gesture.
    const printWindow = format === "pdf" ? window.open("about:blank", "_blank") : null;
    try {
      const blob = await spacesApi.export(spaceId, format, { print: format === "pdf" });
      if (format === "pdf") {
        if (printWindow) {
          const url = window.URL.createObjectURL(blob);
          printWindow.location = url;
          // Revoke after the page has certainly loaded and printed.
          window.setTimeout(() => window.URL.revokeObjectURL(url), 60000);
          success('Print page opened — choose "Save as PDF"');
        } else {
          // Popup blocked: hand the page over as a file instead of failing.
          downloadBlob(blob, exportFilename(spaceTitle, "pdf"));
          success("Popup was blocked — downloaded the print page instead");
        }
      } else {
        downloadBlob(blob, exportFilename(spaceTitle, format));
        success(`${fmt?.label || format} downloaded`);
      }
    } catch (err) {
      error(err.message || "Export failed");
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

        <RadioGroup
          value={format}
          onValueChange={setFormat}
          ariaLabel="Export format"
          className="space-y-2"
        >
          {FORMATS.map((f) => (
            <RadioGroupItem
              key={f.id}
              value={f.id}
              hideIndicator
              className={cn(
                "items-start gap-3 border-2 p-3 text-base transition-all",
                format === f.id
                  ? "border-primary"
                  : "border-border hover:border-primary/30"
              )}
            >
              <f.icon className="size-5 text-primary shrink-0" aria-hidden />
              <div className="flex-1 text-left">
                <div className="font-medium">{f.label}</div>
                <div className="text-xs text-muted-foreground">{f.desc}</div>
              </div>
              <ArrowDown className="size-4 text-muted-foreground" />
            </RadioGroupItem>
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
            ) : format === "pdf" ? (
              <>
                <Download className="size-4" /> Open print page
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
