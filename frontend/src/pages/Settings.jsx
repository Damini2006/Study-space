import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMutation as useApiMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useTheme, THEMES } from "@/hooks/useTheme";
import { useToast } from "@/components/ui/toast";
import { meApi } from "@/services/api-services";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const THEME_DOTS = {
  light: "#f7f8fc",
  dark: "#171a2e",
  cozy: "#faf3e8",
  pastel: "#fbf7ff",
};

export default function Settings() {
  const { profile, signOut, isDemo } = useAuth();
  const { theme, setTheme } = useTheme();
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(profile?.display_name || "");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("account");
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const updateProfile = useMutation({
    mutationFn: (body) => meApi.update(body),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
      success("Profile updated.");
    },
    onError: error,
  });

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateProfile.mutateAsync({ display_name: name, theme });
      setSaving(false);
    } catch {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(meApi.exportUrl, {
        headers: { Authorization: `Bearer ${(await import("@/lib/supabase")).supabase.auth.getSession().then(({ data }) => data.session?.access_token)}` }
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `studyspace-export-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      success("Data exported.");
    } catch (err) {
      error(err.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    if (deleteConfirm !== "DELETE") {
      error("Type DELETE to confirm");
      return;
    }
    setDeleting(true);
    try {
      await meApi.delete();
      success("All data deleted. Signing out...");
      await signOut();
    } catch (err) {
      error(err.message || "Deletion failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Manage your account, theme and data.</p>
        </div>
        {isDemo && <Badge variant="info">Demo workspace</Badge>}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="data">Data & privacy</TabsTrigger>
          <TabsTrigger value="mcp">MCP tokens</TabsTrigger>
        </TabsList>

        <TabsContent value="account" className="space-y-4">
          <Card className="p-5 space-y-4">
            <h3 className="font-semibold">Profile</h3>
            <form onSubmit={handleSave} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="display_name">Display name</Label>
                <Input id="display_name" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
              </div>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin mr-1" />}
                Save changes
              </Button>
            </form>
            <div className="pt-3 border-t border-border">
              <p className="text-sm text-muted-foreground">Signed in as <span className="font-medium">{profile?.email}</span></p>
              {isDemo && <p className="mt-1 text-xs text-warning">This is a demo workspace. Data can be reset from the dashboard.</p>}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="appearance" className="space-y-4">
          <Card className="p-5 space-y-4">
            <h3 className="font-semibold">Theme</h3>
            <p className="text-sm text-muted-foreground">Choose your preferred color scheme. Changes apply immediately.</p>
            <div className="grid grid-cols-4 gap-3">
              {THEMES.map(t => (
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
                  <div className="size-10 rounded-full mx-auto mb-2 border" style={{ background: THEME_DOTS[t.id] }} />
                  <div className="text-sm font-medium capitalize">{t.label}</div>
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <h3 className="font-semibold">Reduced motion</h3>
            <p className="text-sm text-muted-foreground">The app respects your system <code>prefers-reduced-motion</code> setting. All animations are disabled when enabled.</p>
          </Card>
        </TabsContent>

        <TabsContent value="data" className="space-y-4">
          <Card className="p-5 space-y-4">
            <h3 className="font-semibold">Export your data</h3>
            <p className="text-sm text-muted-foreground">Download a complete JSON backup of your spaces, notes, cards, reviews, habits, focus sessions and plans.</p>
            <Button variant="outline" onClick={handleExport} disabled={exporting}>
              {exporting && <Loader2 className="size-4 animate-spin mr-1" />}
              Export all data (JSON)
            </Button>
          </Card>

          <Card className="p-5 space-y-4 border-destructive/30">
            <h3 className="font-semibold text-destructive">Delete account</h3>
            <p className="text-sm text-muted-foreground">Permanently delete all your study data. This cannot be undone.</p>
            <div className="space-y-2">
              <Label htmlFor="delete_confirm">Type DELETE to confirm</Label>
              <Input id="delete_confirm" value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder="DELETE" />
              <Button variant="destructive" onClick={handleDelete} disabled={deleting || deleteConfirm !== "DELETE"}>
                {deleting && <Loader2 className="size-4 animate-spin mr-1" />}
                Delete my account and all data
              </Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="mcp" className="space-y-4">
          <Card className="p-5 space-y-4">
            <h3 className="font-semibold">MCP personal access tokens</h3>
            <p className="text-sm text-muted-foreground">Create revocable tokens for MCP clients (e.g. Claude Desktop) to access your study data. Write scope allows creating notes.</p>
            
            <McpTokensSection />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function McpTokensSection() {
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newTokenName, setNewTokenName] = useState("");
  const [newTokenScopes, setNewTokenScopes] = useState(["read"]);
  const [creating, setCreating] = useState(false);

  const { data: tokens = [] } = useQuery({ queryKey: ["me", "mcp-tokens"], queryFn: () => meApi.mcpTokens() });

  const createToken = useMutation({
    mutationFn: (body) => meApi.createMcpToken(body),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["me", "mcp-tokens"] });
      success(`Token created. Copy it now: ${data.token}`);
      setShowCreate(false);
      setNewTokenName("");
    },
    onError: error,
  });

  const revokeToken = useMutation({
    mutationFn: (id) => meApi.revokeMcpToken(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["me", "mcp-tokens"] }),
    onError: error,
  });

  return (
    <div className="space-y-3">
      <Button onClick={() => setShowCreate(true)}>
        <Plus className="size-4 mr-1" /> Create token
      </Button>

      <Dialog open={showCreate} onClose={() => { setShowCreate(false); setNewTokenName(""); }} title="Create MCP token" className="max-w-md">
        <form onSubmit={e => { e.preventDefault(); createToken.mutate({ name: newTokenName, scopes: newTokenScopes }); }} className="p-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="token_name">Name</Label>
            <Input id="token_name" value={newTokenName} onChange={e => setNewTokenName(e.target.value)} placeholder="Claude Desktop" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Scopes</Label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={newTokenScopes.includes("read")} onChange={e => setNewTokenScopes(e.target.checked ? [...newTokenScopes, "read"] : newTokenScopes.filter(s => s !== "read"))} className="size-4 accent-primary" />
              <span>Read (list spaces, search sources, get due cards, stats)</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={newTokenScopes.includes("write")} onChange={e => setNewTokenScopes(e.target.checked ? [...newTokenScopes, "write"] : newTokenScopes.filter(s => s !== "write"))} className="size-4 accent-primary" />
              <span>Write (create notes)</span>
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" disabled={creating || !newTokenName.trim()}>
              {creating && <Loader2 className="size-4 animate-spin mr-1" />}
              Create token
            </Button>
          </div>
        </form>
      </Dialog>

      {tokens.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No tokens yet. Create one to connect an MCP client.</p>
      ) : (
        <div className="space-y-2">
          {tokens.map(t => (
            <Card key={t.id} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-mono text-xs">{t.token_prefix.slice(0,2)}</div>
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.scopes.join(", ")} · Created {formatDate(t.created_at)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={t.revoked_at ? "default" : "success"} className="text-[10px]">{t.revoked_at ? "Revoked" : "Active"}</Badge>
                {!t.revoked_at && (
                  <Button variant="ghost" size="sm" onClick={() => { if (confirm("Revoke this token?")) revokeToken.mutate(t.id); }}>
                    <X className="size-3.5 mr-1" /> Revoke
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}