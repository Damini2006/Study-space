import { useCallback, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { spacesApi } from "@/services/api-services";

/**
 * Space workspace — the centerpiece.
 * Desktop: three panels (Sources | Chat | Studio).
 * Mobile: tabs.
 */
export default function Workspace() {
  const { spaceId } = useParams();
  const [mobileTab, setMobileTab] = useState("chat");
  const [selectedPassage, setSelectedPassage] = useState(null);

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
      </div>

      {/* Mobile tabs */}
      <Tabs value={mobileTab} onValueChange={setMobileTab} className="flex min-h-0 flex-1 flex-col xl:hidden" ariaLabel="Workspace panels">
        <TabsList variant="pill" className="mb-2 grid grid-cols-3">
          <TabsTrigger value="sources" className="justify-center gap-1.5" >
            <NotebookPen className="size-4" /> Sources
          </TabsTrigger>
          <TabsTrigger value="chat" className="justify-center gap-1.5">
            <MessageSquare className="size-4" /> Chat
          </TabsTrigger>
          <TabsTrigger value="studio" className="justify-center gap-1.5">
            <SparklesIcon /> Studio
          </TabsTrigger>
        </TabsList>
        <TabsContent value="sources" className="min-h-0 flex-1">
          <SourcesPanel spaceId={spaceId} selectedPassage={selectedPassage} onClearPassage={() => setSelectedPassage(null)} onSourceChanged={() => {}} />
        </TabsContent>
        <TabsContent value="chat" className="min-h-0 flex-1">
          <ChatPanel spaceId={spaceId} onSelectPassage={handleSelectPassage} />
        </TabsContent>
        <TabsContent value="studio" className="min-h-0 flex-1">
          <StudioPanel spaceId={spaceId} />
        </TabsContent>
      </Tabs>

      {/* Desktop 3-pane */}
      <div className="hidden min-h-0 flex-1 gap-3 xl:grid xl:grid-cols-[300px_minmax(0,1.35fr)_360px]">
        <SourcesPanel spaceId={spaceId} selectedPassage={selectedPassage} onClearPassage={() => setSelectedPassage(null)} onSourceChanged={() => {}} />
        <ChatPanel spaceId={spaceId} onSelectPassage={handleSelectPassage} />
        <StudioPanel spaceId={spaceId} />
      </div>
    </div>
  );
}

function SparklesIcon() {
  return (
    <svg aria-hidden className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z" />
    </svg>
  );
}
