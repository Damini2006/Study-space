import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useTheme, THEMES } from "@/hooks/useTheme";
import { useToast } from "@/components/ui/toast";
import { meApi } from "@/services/api-services";
import { cn, formatDate } from "@/lib/utils";

export default function MCPManagement() {
  const { profile, signOut, isDemo } = useAuth();
  const { theme, setTheme } = useTheme();
  const { success, error, toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("tokens");
  const [tokens = [], setTokens] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newTokenName, setNewTokenName] = useState("");
  const [newTokenScopes, setNewTokenScopes] = useState(["read"]);
  const [creating, setCreating] = useState(false);
  const [editingToken, setEditingToken] = useState(null);
  const [showRevoke, setShowRevoke] = useState(false);
  const [tokenToRevoke, setTokenToRevoke] = useState(null);

  const { data: mcpTokens = [] } = useQuery({ queryKey: ["me", "mcp-tokens"], queryFn: () => meApi.mcpTokens() });

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

  const handleCopyToken = (token) => {
    navigator.clipboard.writeText(token);
    toast("Token copied to clipboard!");
  };

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
          <h1 className="text-2xl font-bold tracking-tight">MCP Tokens</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Create revocable tokens for MCP clients (e.g. Claude Desktop) to access your study data.</p>
        </div>
        {isDemo && <Badge variant="info">Demo workspace</Badge>}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="tokens">Tokens</TabsTrigger>
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
                      onChange={e => setNewTokenScopes(toggleScope(newTokenScopes, "read"))}
                      className="size-4 accent-primary"
                    />
                    <span>Read (list spaces, search sources, get due cards, stats)</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={newTokenScopes.includes("write")}
                      onChange={e => setNewTokenScopes(toggleScope(newTokenScopes, "write"))}
                      className="size-4 accent-primary"
                    />
                    <span>Write (create notes)</span>
                  </label>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
                  <Button type="submit" disabled={!newTokenName.trim() || creating}>
                    {creating && <Loader2 className="size-4 animate-spin mr-1" />}
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
                    <Card
                      key={t.id}
                      className="p-4 flex items-center justify-between"
                      onClick={() => setEditingToken(t.id)}
                    >
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
                        {editingToken?.id === t.id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingToken(null);
                            }}
                          >
                            <X className="size-3.5" />
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
    </div>
  );
}

/* Helper function */
function toggleScope(scopes, scope) {
  if (scopes.includes(scope)) {
    return scopes.filter(s => s !== scope);
  }
  return [...scopes, scope];
}