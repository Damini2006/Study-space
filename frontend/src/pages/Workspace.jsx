import { useCallback, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Layers, MessageSquare, NotebookPen, Share2, Globe, Download, FileUp, Sparkles } from "lucide-react";
import { spacesApi } from "@/services/api-services";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/dialog";
import SourcesPanel from "@/components/workspace/SourcesPanel";
import ChatPanel from "@/components/workspace/ChatPanel";
import StudioPanel from "@/components/workspace/StudioPanel";
import ShareDialog from "@/components/workspace/ShareDialog";
import PublishDialog from "@/components/workspace/PublishDialog";
import ExportDialog from "@/components/workspace/ExportDialog";
import ImportDialog from "@/components/workspace/ImportDialog";
import SplitView from "@/components/ui/split-view";

/**
 * Space workspace — the centerpiece.
 * Desktop: Sources | (Chat + Studio resizable split)
 * Mobile: tabs
 */
export default function Workspace() {
  const { spaceId } = useParams();
  const [mobileTab, setMobileTab] = useState("chat");
  const [selectedPassage, setSelectedPassage] = useState(null);

  // Dialogs
  const [shareOpen, setShareOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const { data: space, isLoading, error } = useQuery({
    queryKey: ["spaces", spaceId],
    queryFn: () => spacesApi.get(spaceId),
  });

  // citation click in chat -> sources panel scrolls + highlights (mobile: jump tab)
  const handleSelectPassage = useCallback((passage) => {
    setSelectedPassage(passage);
    if (window.innerWidth < 1280) setMobileTab("sources");
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl">
        <Link to="/app/dashboard" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back
        </Link>
        <p className="rounded-xl border border-destructive/30 bg-danger-bg px-4 py-3 text-sm text-destructive">
          That Space does not exist or you do not have access to it.
        </p>
      </div>
    );
  }

  if (isLoading || !space) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-8 w-64 rounded-lg" />
        <div className="skeleton h-[60vh] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-8.5rem)] max-w-[1600px] flex-col gap-3 lg:h-[calc(100dvh-5.5rem)]">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/app/dashboard" aria-label="Back to dashboard" className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2">
          <ArrowLeft className="size-4" />
        </Link>
        <span className="size-3 rounded-full" style={{ background: space.color || "#4F5BD5" }} aria-hidden />
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold tracking-tight">{space.title}</h1>
        {space.subject && <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-muted-foreground">{space.subject}</span>}
        <Link to="/app/study">
          <Button variant="ghost" size="sm">
            <Layers className="size-4" /> <span className="hidden sm:inline">Review ({space.due_today})</span>
          </Button>
        </Link>

        {/* Actions */}
        <div className="flex items-center gap-1.5 ml-auto">
          <Button variant="ghost" size="icon" onClick={() => setShareOpen(true)} aria-label="Share space">
            <Share2 className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setPublishOpen(true)} aria-label="Publish to web">
            <Globe className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setExportOpen(true)} aria-label="Export space">
            <Download className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setImportOpen(true)} aria-label="Import into space">
            <FileUp className="size-4" />
          </Button>
        </div>
      </div>

      {/* Mobile tabs */}
      <Tabs value={mobileTab} onValueChange={setMobileTab} className="flex min-h-0 flex-1 flex-col xl:hidden" ariaLabel="Workspace panels">
        <TabsList variant="pill" className="mb-2 grid grid-cols-3">
          <TabsTrigger value="sources" className="justify-center gap-1.5">
            <NotebookPen className="size-4" /> Sources
          </TabsTrigger>
          <TabsTrigger value="chat" className="justify-center gap-1.5">
            <MessageSquare className="size-4" /> Chat
          </TabsTrigger>
          <TabsTrigger value="studio" className="justify-center gap-1.5">
            <Sparkles className="size-4" /> Studio
          </TabsTrigger>
        </TabsList>
        <TabsContent value="sources" className="min-h-0 flex-1">
          <SourcesPanel spaceId={spaceId} selectedPassage={selectedPassage} onClearPassage={() => setSelectedPassage(null)} onSelectPassage={setSelectedPassage} onSourceChanged={() => {}} />
        </TabsContent>
        <TabsContent value="chat" className="min-h-0 flex-1">
          <ChatPanel spaceId={spaceId} onSelectPassage={handleSelectPassage} />
        </TabsContent>
        <TabsContent value="studio" className="min-h-0 flex-1">
          <StudioPanel spaceId={spaceId} />
        </TabsContent>
      </Tabs>

      {/* Desktop — Sources | Chat+Studio (resizable split) */}
      <div className="hidden min-h-0 flex-1 xl:grid xl:grid-cols-[300px_minmax(0,1fr)] gap-3">
        {/* Sources panel — fixed width */}
        <SourcesPanel spaceId={spaceId} selectedPassage={selectedPassage} onClearPassage={() => setSelectedPassage(null)} onSelectPassage={setSelectedPassage} onSourceChanged={() => {}} />

        {/* Chat + Studio — resizable split */}
        <SplitView
          layout="horizontal"
          defaultRatio={0.65}
          minRatio={0.3}
          maxRatio={0.8}
          storageKey={`workspace:${spaceId}`}
          className="min-h-0 flex-1"
        >
          <ChatPanel spaceId={spaceId} onSelectPassage={handleSelectPassage} />
          <StudioPanel spaceId={spaceId} />
        </SplitView>
      </div>

      {/* Dialogs */}
      <ShareDialog spaceId={spaceId} open={shareOpen} onClose={() => setShareOpen(false)} />
      <PublishDialog spaceId={spaceId} open={publishOpen} onClose={() => setPublishOpen(false)} />
      <ExportDialog spaceId={spaceId} spaceTitle={space.title} open={exportOpen} onClose={() => setExportOpen(false)} />
      <ImportDialog spaceId={spaceId} open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}