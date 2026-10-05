import { useState, useEffect } from "react";
import { Copy, Clock, Trash2, Check } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";
import { spacesApi } from "@/services/api-services";

const ROLE_LABELS = { viewer: "Viewer", editor: "Editor" };
const ROLE_DESC = {
  viewer: "Can view space, sources, and chat. Cannot edit.",
  editor: "Full edit access: add sources, create cards, modify notes.",
};

function CopyButton({ text, onCopied, children }) {
  const [copied, setCopied] = useState(false);
  const handleClick = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    onCopied?.();
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button variant="ghost" size="icon" onClick={handleClick} aria-label={copied ? "Copied!" : "Copy to clipboard"}>
      {copied ? <Check className="size-4 text-success" /> : (children || <Copy className="size-4" />)}
    </Button>
  );
}

function ShareRow({ share, onRevoke }) {
  const isRevoked = !!share.revoked_at;
  const isExpired = share.expires_at && new Date(share.expires_at) < new Date();

  return (
    <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
      <div className="flex items-center gap-3">
        <Badge variant={share.role === "editor" ? "success" : "default"} className="text-xs">
          {ROLE_LABELS[share.role]}
        </Badge>
        <div className="text-sm text-muted-foreground font-mono">
          {share.token.slice(0, 12)}…
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {share.expires_at && (
          <>
            <Clock className="size-3" />
            {isExpired ? "Expired" : `Expires ${formatDate(share.expires_at)}`}
          </>
        )}
        {isRevoked && <Badge variant="destructive" className="text-[10px]">Revoked</Badge>}
      </div>
      <div className="flex items-center gap-1">
        <CopyButton text={`${window.location.origin}/spaces/shared/${share.token}`} />
        {!isRevoked && (
          <Button variant="ghost" size="icon" onClick={() => onRevoke(share.id)} aria-label="Revoke">
            <Trash2 className="size-4 text-destructive" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default function ShareDialog({ spaceId, open, onClose }) {
  const { success, error } = useToast();
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newShareRole, setNewShareRole] = useState("viewer");
  const [newShareExpires, setNewShareExpires] = useState(7); // days

  useEffect(() => {
    if (open) {
      loadShares();
    }
  }, [open]);

  const loadShares = async () => {
    try {
      const data = await spacesApi.listShares(spaceId);
      setShares(data);
    } catch (e) {
      error("Failed to load shares");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    try {
      const body = { role: newShareRole, expires_in_days: newShareExpires || undefined };
      const share = await spacesApi.createShare(spaceId, body);
      setShares([share, ...shares]);
      success("Invite link created!");
      // Auto-copy the full URL
      const url = `${window.location.origin}/spaces/shared/${share.token}`;
      await navigator.clipboard.writeText(url);
    } catch (e) {
      error(e.message || "Failed to create invite");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (shareId) => {
    try {
      await spacesApi.revokeShare(spaceId, shareId);
      setShares(shares.map((s) => (s.id === shareId ? { ...s, revoked_at: new Date().toISOString() } : s)));
      success("Access revoked");
    } catch (e) {
      error(e.message || "Failed to revoke");
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onClose={onClose} title="Share this space" className="max-w-xl p-0">
      <form onSubmit={handleCreate} className="p-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          Create invite links with specific roles. Links can expire and be revoked anytime.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={newShareRole} onValueChange={setNewShareRole}>
              <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer — read only</SelectItem>
                <SelectItem value="editor">Editor — full access</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">{ROLE_DESC[newShareRole]}</p>
          </div>

          <div className="space-y-1.5">
            <Label>Expires in</Label>
            <Select value={String(newShareExpires)} onValueChange={(v) => setNewShareExpires(Number(v))}>
              <SelectTrigger><SelectValue placeholder="Never" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 day</SelectItem>
                <SelectItem value="7">1 week</SelectItem>
                <SelectItem value="30">1 month</SelectItem>
                <SelectItem value="90">3 months</SelectItem>
                <SelectItem value="0">Never</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button type="submit" disabled={creating} className="w-full">
          {creating ? "Creating…" : "Create invite link"}
        </Button>
      </form>

      <div className="border-t border-border p-4 space-y-3 max-h-64 overflow-y-auto">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">Active shares</h4>
          <span className="text-xs text-muted-foreground">{shares.filter(s => !s.revoked_at).length} active</span>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg border border-border bg-surface-2" />
            ))}
          </div>
        ) : shares.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No shares yet. Create one above.</p>
        ) : (
          <div className="space-y-2">
            {shares.map((share) => (
              <ShareRow key={share.id} share={share} onRevoke={handleRevoke} />
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}