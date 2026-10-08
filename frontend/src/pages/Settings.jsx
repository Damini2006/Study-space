import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useTheme, THEMES } from "@/hooks/useTheme";
import { useToast } from "@/components/ui/toast";
import { meApi, spacesApi } from "@/services/api-services";
import ModelRouterPanel from "@/components/settings/ModelRouterPanel";
import PromptTemplatesPanel from "@/components/settings/PromptTemplatesPanel";
import RagSettingsPanel from "@/components/settings/RagSettingsPanel";
import CitationAuditPanel from "@/components/settings/CitationAuditPanel";
import PwaSettings from "@/components/pwa/PwaSettings";
import { clearQueue, enqueueReview, flushQueue, queueSize } from "@/lib/offline-queue";
import { studyApi } from "@/services/api-services";
import { accountExportFilename, downloadBlob } from "@/lib/export-file";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, Input, Label } from "@/components/ui/input";
import { Dialog, Select } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/dialog";
import { cn, formatDate } from "@/lib/utils";
import { Copy, Loader2, Plus, X } from "lucide-react";

function DemoNotice({ feature }) {
  return (
    <Card className="p-5">
      <h3 className="font-semibold">{feature}</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Not available in the demo workspace. Create your own space to use it.
      </p>
    </Card>
  );
}

export default function SettingsPage() {
  const { isDemo, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { success, error, toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("tokens");
  const [showCreate, setShowCreate] = useState(false);
  const [newTokenName, setNewTokenName] = useState("");
  const [newTokenScopes, setNewTokenScopes] = useState(["read"]);
  const [showRevoke, setShowRevoke] = useState(false);
  const [tokenToRevoke, setTokenToRevoke] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const { data: mcpTokens = [] } = useQuery({ queryKey: ["me", "mcp-tokens"], queryFn: () => meApi.mcpTokens() });

  // Offline review-queue controls — surfaced here because it's the only place
  // that can explain what "waiting to sync" means.
  const [queuePending, setQueuePending] = useState(0);
  const refreshQueue = async () => setQueuePending(await queueSize());
  useEffect(() => {
    refreshQueue();
  }, []);
  const flushQueueNow = async () => {
    const { flushed } = await flushQueue((entry) => studyApi.review(entry));
    refreshQueue();
    if (flushed) success(`Synced ${flushed} queued review${flushed === 1 ? "" : "s"}.`);
  };
  const { data: spaces = [] } = useQuery({
    queryKey: ["spaces"],
    queryFn: () => spacesApi.list(),
    enabled: !isDemo,
  });

  // RAG tuning and citation audit are per-space; default to the first space so
  // the panel is never in a dead-end state after landing on Settings.
  const [activeSpaceId, setActiveSpaceId] = useState("");
  useEffect(() => {
    if (!activeSpaceId && spaces.length) setActiveSpaceId(spaces[0].id);
  }, [spaces, activeSpaceId]);

  const createToken = useMutation({
    mutationFn: (body) => meApi.createMcpToken(body),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["me", "mcp-tokens"] });
      toast(`Token created. Copy it now: ${data.token}`);
      setShowCreate(false);
      setNewTokenName("");
      setNewTokenScopes(["read"]);
    },
    onError: error,
  });

  const revokeToken = useMutation({
    mutationFn: (id) => meApi.revokeMcpToken(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me", "mcp-tokens"] });
      success("Token revoked.");
      setShowRevoke(false);
      setTokenToRevoke(null);
    },
    onError: error,
  });

  // Your data: the export is a real authenticated download of GET /me/export,
  // and deletion shows the server's own count sentence — not one we invent.
  const exportData = useMutation({
    mutationFn: () => meApi.export(),
    onSuccess: (blob) => {
      downloadBlob(blob, accountExportFilename());
      success("Export downloaded.");
    },
    onError: error,
  });

  const deleteData = useMutation({
    mutationFn: () => meApi.delete(),
    onSuccess: (data) => {
      success(data?.detail || "All study data deleted.");
      setDeleteConfirmText("");
      signOut();
    },
    onError: error,
  });

  const handleCopyToken = (token) => {
    navigator.clipboard.writeText(token);
    toast("Token copied to clipboard!");
  };

  const confirmRevoke = () => {
    if (tokenToRevoke) revokeToken.mutate(tokenToRevoke);
  };

  const revokeTarget = mcpTokens.find((t) => t.id === tokenToRevoke);

  const toggleScope = (scopes, scope) => {
    if (scopes.includes(scope)) {
      return scopes.filter(s => s !== scope);
    }
    return [...scopes, scope];
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Tokens, model routing, prompts, retrieval, your data, and the app itself.</p>
        </div>
        {isDemo && <Badge variant="info">Demo workspace</Badge>}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="tokens">Tokens</TabsTrigger>
          <TabsTrigger value="models">Models</TabsTrigger>
          <TabsTrigger value="prompts">Prompts</TabsTrigger>
          <TabsTrigger value="retrieval">Retrieval</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
          <TabsTrigger value="app">App</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="tokens" className="space-y-3">
          <Card className="p-5 space-y-4">
            <h3 className="font-semibold">MCP personal access tokens</h3>
            <p className="text-sm text-muted-foreground">
              Create revocable tokens for MCP clients (e.g. Claude Desktop) to access your study data. Write scope allows creating notes.
            </p>

            {/* Token creation section */}
            <div className="mb-4">
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="size-4 mr-1" /> Create token
              </Button>
            </div>

            <Dialog
              open={showCreate}
              onClose={() => {
                setShowCreate(false);
                setNewTokenName("");
                setNewTokenScopes(["read"]);
              }}
              title="Create MCP token"
              className="max-w-md"
            >
              <form onSubmit={e => {
                e.preventDefault();
                createToken.mutate({ name: newTokenName, scopes: newTokenScopes });
              }} className="p-4 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="token_name">Name</Label>
                  <Input
                    id="token_name"
                    value={newTokenName}
                    onChange={e => setNewTokenName(e.target.value)}
                    placeholder="Claude Desktop"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Scopes</Label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={newTokenScopes.includes("read")}
                      onChange={() => setNewTokenScopes(toggleScope(newTokenScopes, "read"))}
                      className="size-4 accent-primary"
                    />
                    <span>Read (list spaces, search sources, get due cards, stats)</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={newTokenScopes.includes("write")}
                      onChange={() => setNewTokenScopes(toggleScope(newTokenScopes, "write"))}
                      className="size-4 accent-primary"
                    />
                    <span>Write (create notes)</span>
                  </label>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
                  <Button type="submit" disabled={!newTokenName.trim() || createToken.isPending}>
                    {createToken.isPending && <Loader2 className="size-4 animate-spin mr-1" />}
                    Create token
                  </Button>
                </div>
              </form>
            </Dialog>

            {/* Tokens list */}
            <div className="space-y-3">
              {mcpTokens.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No tokens yet. Create one to connect an MCP client.</p>
              ) : (
                <div className="space-y-2">
                  {mcpTokens.map((t) => (
                    <Card key={t.id} className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-mono text-xs">
                          {t.token_prefix ? t.token_prefix.slice(0, 4) + "..." : "---"}
                        </div>
                        <div>
                          <p className="font-medium">{t.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {t.scopes.join(", ")} · Created {formatDate(t.created_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={t.revoked_at ? "default" : "success"}
                          className="text-[10px]"
                        >
                          {t.revoked_at ? "Revoked" : "Active"}
                        </Badge>
                        {!t.revoked_at && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setTokenToRevoke(t.id);
                              setShowRevoke(true);
                            }}
                          >
                            <X className="size-3.5 mr-1" /> Revoke
                          </Button>
                        )}
                        {!t.revoked_at && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyToken(t.token)}
                            title="Copy token"
                          >
                            <Copy className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="models" className="space-y-4">
          {isDemo ? <DemoNotice feature="Model router" /> : <ModelRouterPanel />}
        </TabsContent>

        <TabsContent value="prompts" className="space-y-4">
          {isDemo ? <DemoNotice feature="Prompt templates" /> : <PromptTemplatesPanel spaceId={activeSpaceId || null} />}
        </TabsContent>

        <TabsContent value="retrieval" className="space-y-4">
          {isDemo ? (
            <DemoNotice feature="Retrieval tuning" />
          ) : (
            <div className="space-y-4">
              <Card className="p-4">
                <Label htmlFor="rag_space">Space</Label>
                <Select
                  id="rag_space"
                  className="mt-1.5 max-w-sm"
                  value={activeSpaceId}
                  onValueChange={setActiveSpaceId}
                  placeholder="Choose a space"
                  options={spaces.map((s) => ({ value: s.id, label: s.title }))}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Retrieval settings are stored per space, so each subject can have its own tuning.
                </p>
              </Card>
              <RagSettingsPanel spaceId={activeSpaceId} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          {isDemo ? (
            <DemoNotice feature="Citation audit" />
          ) : (
            <div className="space-y-4">
              <Card className="p-4">
                <Label htmlFor="audit_space">Space</Label>
                <Select
                  id="audit_space"
                  className="mt-1.5 max-w-sm"
                  value={activeSpaceId}
                  onValueChange={setActiveSpaceId}
                  placeholder="Choose a space"
                  options={spaces.map((s) => ({ value: s.id, label: s.title }))}
                />
              </Card>
              <CitationAuditPanel spaceId={activeSpaceId} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="app" className="space-y-4">
          <PwaSettings />
          <Card className="p-5 space-y-3">
            <h3 className="font-semibold">Offline reviews</h3>
            <p className="text-sm text-muted-foreground">
              Grades are written to this device first and sent to the server when a connection is
              available, so reviewing on a train never loses your progress. Sync also happens
              automatically whenever the tab regains focus.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  enqueueReview({
                    card_id: "00000000-0000-0000-0000-000000000000",
                    rating: 3,
                    graded_at: new Date().toISOString(),
                    duration_ms: 1200,
                  });
                  refreshQueue();
                  success("Queued a test review to demonstrate offline sync.");
                }}
              >
                Queue a test review
              </Button>
              <Button size="sm" variant="ghost" onClick={() => flushQueueNow()}>
                Sync now
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await clearQueue();
                  refreshQueue();
                }}
              >
                Clear queue
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {queuePending} waiting to sync.
            </p>
          </Card>
        </TabsContent>

        <TabsContent value="data" className="space-y-4">
          <Card className="p-5 space-y-4">
            <h3 className="font-semibold">Export your data</h3>
            <p className="text-sm text-muted-foreground">
              Download every row this account owns — spaces, sources, notes, cards, review
              history, plans, focus sessions and more — as one JSON file, through the same
              authenticated path as the rest of the app.
            </p>
            <Button size="sm" variant="outline" onClick={() => exportData.mutate()} disabled={exportData.isPending}>
              {exportData.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Download JSON
            </Button>
          </Card>

          <Card className="space-y-4 border-destructive/25 p-5">
            <h3 className="font-semibold text-destructive">Delete your data</h3>
            <p className="text-sm text-muted-foreground">
              Removes every study row — spaces, sources, notes, cards, embeddings, review
              history — and every stored document, then reports the exact counts of what was
              removed. Your sign-in email remains: the app never holds the admin keys needed
              to erase it. This cannot be undone.
            </p>
            {isDemo ? (
              <p className="text-sm text-muted-foreground">Not available in the demo workspace.</p>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="delete-confirm">Type DELETE to confirm</Label>
                  <Input
                    id="delete-confirm"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => deleteData.mutate()}
                  disabled={deleteConfirmText !== "DELETE" || deleteData.isPending}
                >
                  {deleteData.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  Delete all my data
                </Button>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card className="p-5 space-y-4">
            <h3 className="font-semibold">Theme</h3>
            <p className="text-sm text-muted-foreground">Choose your preferred color scheme. Changes apply immediately.</p>
            <div className="grid grid-cols-4 gap-3">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTheme(t.id)}
                  aria-pressed={theme === t.id}
                  className={cn(
                    "relative rounded-xl border-2 p-3 text-center transition-all",
                    theme === t.id ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40"
                  )}
                >
                  <div className="size-10 rounded-full mx-auto mb-2 border border-border" style={{ background: t.swatch }} />
                  <div className="text-sm font-medium capitalize">{t.label}</div>
                </button>
              ))}
            </div>

            <Card className="p-5 space-y-4">
              <h3 className="font-semibold">Reduced motion</h3>
              <p className="text-sm text-muted-foreground">
                The app respects your system <code>prefers-reduced-motion</code> setting. All animations are disabled when enabled.
              </p>
            </Card>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Revoking is irreversible and kills live MCP clients, so confirm first. */}
      <Dialog
        open={showRevoke}
        onClose={() => {
          setShowRevoke(false);
          setTokenToRevoke(null);
        }}
        title="Revoke this token?"
        description="Any MCP client still using it loses access immediately."
        className="max-w-sm"
      >
        <p className="text-sm text-muted-foreground">
          {revokeTarget?.name ? (
            <>
              <span className="font-medium text-foreground">{revokeTarget.name}</span> —{" "}
            </>
          ) : null}
          {revokeTarget?.token_prefix ? `${revokeTarget.token_prefix}… ` : ""}
          This cannot be undone. You can create a replacement token afterwards.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowRevoke(false);
              setTokenToRevoke(null);
            }}
          >
            Keep it
          </Button>
          <Button variant="destructive" size="sm" onClick={confirmRevoke} disabled={revokeToken.isPending}>
            {revokeToken.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Revoke token
          </Button>
        </div>
      </Dialog>
    </div>
  );
}