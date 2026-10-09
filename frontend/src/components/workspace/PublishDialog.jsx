import { useEffect, useState } from "react";
import { Globe, Copy, Check, ExternalLink } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { spacesApi } from "@/services/api-services";

function CopyButton({ text, onCopied }) {
  const [copied, setCopied] = useState(false);
  const handleClick = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    onCopied?.();
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button variant="ghost" size="icon" onClick={handleClick} aria-label={copied ? "Copied!" : "Copy URL"}>
      {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
    </Button>
  );
}

export default function PublishDialog({ spaceId, open, onClose }) {
  const { success, error, toast } = useToast();
  const [slug, setSlug] = useState("");
  const [publicInfo, setPublicInfo] = useState(null);
  const [checking, setChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  // The link is live only while the space has a public row that has not been
  // unpublished — the backend keeps the row either way, so `unpublished_at`
  // is what separates "published" from "was published once".
  const published = Boolean(publicInfo) && !publicInfo.unpublished_at;

  // Look the current publish state up on every open, so an already-published
  // space shows its live URL instead of asking the user to publish again.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setChecking(true);
    setCheckFailed(false);
    setPublicInfo(null);
    setSlug("");
    spacesApi.getPublicInfo(spaceId)
      .then((info) => {
        if (cancelled) return;
        setPublicInfo(info ?? null);
        setSlug(info?.slug ?? "");
        setChecking(false);
      })
      .catch(() => {
        if (cancelled) return;
        setCheckFailed(true);
        setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, spaceId]);

  const handlePublish = async (e) => {
    e.preventDefault();
    if (!slug.trim() || saving) return;
    setSaving(true);
    try {
      const res = await spacesApi.publish(spaceId, { slug: slug.trim() });
      setPublicInfo(res);
      success("Space published!");
    } catch (e) {
      if (e.status === 409) {
        error("Slug already taken. Try another.");
      } else {
        error(e.message || "Failed to publish");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUnpublish = async () => {
    if (!confirm("Unpublish this space? The public link will stop working immediately.")) return;
    try {
      await spacesApi.unpublish(spaceId);
      setPublicInfo(null);
      success("Space unpublished");
    } catch (e) {
      error(e.message || "Failed to unpublish");
    }
  };

  const copyUrl = async () => {
    if (publicInfo?.public_url) {
      await navigator.clipboard.writeText(publicInfo.public_url);
      toast("Public URL copied!");
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onClose={onClose} title="Publish to web" className="max-w-xl p-0">
      <div className="p-4 space-y-4">
        {checking ? (
          <p className="text-sm text-muted-foreground">Checking publish status…</p>
        ) : !published ? (
          <>
            <p className="text-sm text-muted-foreground">
              Publish a read-only version of this space at a public URL. Anyone with the link can view
              sources, cards, and notes — but not edit. You can unpublish anytime.
            </p>

            {checkFailed ? (
              <p className="text-[11px] text-destructive">
                Couldn't check this space's publish status.
              </p>
            ) : null}

            <form onSubmit={handlePublish} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="pub-slug">Public URL slug</Label>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground px-3 py-2 rounded-l-lg border border-r-0 border-border bg-surface-2 text-sm">
                    {`${window.location.origin}/s/`}
                  </span>
                  <Input
                    id="pub-slug"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                    placeholder="my-study-space"
                    required
                    minLength={3}
                    maxLength={60}
                    className="flex-1 rounded-r-lg border-l-0"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  3–60 characters, lowercase, numbers, and hyphens only.
                </p>
              </div>

              <Button type="submit" disabled={saving || !slug.trim()} className="w-full">
                {saving ? "Publishing…" : "Publish"}
              </Button>
            </form>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-success">
              <Globe className="size-5" />
              <span className="font-medium">Published</span>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground w-20">Public URL</Label>
                <div className="flex-1 flex items-center gap-2">
                  <span className="flex-1 truncate font-mono text-sm text-muted-foreground bg-surface-2 px-2 py-1 rounded">
                    {publicInfo?.public_url}
                  </span>
                  <CopyButton text={publicInfo?.public_url} />
                  <a
                    href={publicInfo?.public_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-sm"
                  >
                    <ExternalLink className="size-4" /> View
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Published {publicInfo?.published_at && new Date(publicInfo.published_at).toLocaleDateString()}</span>
              </div>

              <div className="pt-2 border-t border-border flex gap-2">
                <Button variant="outline" onClick={copyUrl}>
                  <Copy className="size-4" /> Copy link
                </Button>
                <Button variant="destructive" onClick={handleUnpublish}>
                  Unpublish
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}