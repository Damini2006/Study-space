import { useState, useEffect } from "react";
import { Copy, Clock, Trash2, Check } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { Select } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";
import { spacesApi } from "@/services/api-services";

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
  const [newShareExpires, setNewShareExpires] = useState(7); // days

  useEffect(() => {
    if (!open) return;
    // Loading lives inside the effect so the fetch is covered by exactly the
    // values it reads: opening, and the space being viewed. Fetching outside
    // meant a `spaceId` change while the dialog was up kept the previous
    // space's links on screen. The guard stops a slow response from landing
    // after the dialog has moved on.
    let cancelled = false;
    (async () => {
      try {
        const data = await spacesApi.listShares(spaceId);
        if (!cancelled) setShares(data);
      } catch {
        if (!cancelled) error("Failed to load shares");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, spaceId, error]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    try {
      const body = { expires_in_days: newShareExpires || undefined };
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
          Create an invite link — anyone with the URL can open a read-only view
          of this space's sources, cards, and notes. Links can expire and be
          revoked anytime.
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="share_expires">Expires in</Label>
          <Select
            id="share_expires"
            value={String(newShareExpires)}
            onValueChange={(v) => setNewShareExpires(Number(v))}
            placeholder="Never"
            options={[
              { value: "1", label: "1 day" },
              { value: "7", label: "1 week" },
              { value: "30", label: "1 month" },
              { value: "90", label: "3 months" },
              { value: "0", label: "Never" },
            ]}
          />
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