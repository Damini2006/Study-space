/**
 * Vision Board — drag stickies and images around a canvas (restored from
 * the prototype). Positions autosave via PATCH; images upload to the
 * private `vision` storage bucket and render through signed URLs.
 */
import { useCallback, useEffect, useRef, useState } from "react";import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { visionApi } from "@/services/api-services";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const STICKY_COLORS = ["#FFF9B3", "#FFD6E7", "#D9F5E5", "#DDE6FF", "#FFE8C7", "#EFE0FF"];
const GRID = 16; // snap-to-grid step

function snap(v) {
  return Math.round(v / GRID) * GRID;
}

export default function VisionBoard() {
  const qc = useQueryClient();
  const { error: toastError, success } = useToast();
  const fileRef = useRef(null);
  const boardRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["vision"],
    queryFn: () => visionApi.list(),
  });

  const createItem = useMutation({
    mutationFn: (body) => visionApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vision"] }),
    onError: (e) => toastError(e.message || "Could not add that sticky."),
  });

  const patchItem = useMutation({
    mutationFn: ({ id, body }) => visionApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vision"] }),
    onError: (e) => toastError(e.message || "Could not save that move."),
  });

  const removeItem = useMutation({
    mutationFn: (id) => visionApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vision"] });
      success("Removed from board.");
    },
    onError: (e) => toastError(e.message || "Could not remove that item."),
  });

  // pre-place the next sticky roughly in view
  const nextPos = useCallback(() => {
    const n = items.length;
    return {
      x: snap(40 + (n % 4) * 230),
      y: snap(40 + Math.floor(n / 4) * 190),
    };
  }, [items.length]);

  const addSticky = () => {
    const { x, y } = nextPos();
    createItem.mutate({
      kind: "sticky",
      text: "New goal…",
      color: STICKY_COLORS[items.length % STICKY_COLORS.length],
      x,
      y,
      z_index: items.length,
    });
  };

  const onFiles = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await visionApi.upload(fd);
      qc.invalidateQueries({ queryKey: ["vision"] });
      success("Image added to your board.");
    } catch (err) {
      toastError(err.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const onDragEnd = (item) => (_event, info) => {
    const base = { x: item.x, y: item.y };
    const x = snap(base.x + info.offset.x);
    const y = snap(base.y + info.offset.y);
    if (x === item.x && y === item.y) return;
    patchItem.mutate({ id: item.id, body: { x, y } });
  };

  const editText = (item, text) => {
    patchItem.mutate({ id: item.id, body: { text } });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vision Board</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Drag stickies and images around — everything autosaves.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFiles} />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
            Add image
          </Button>
          <Button onClick={addSticky} disabled={createItem.isPending}>
            <StickyNote className="size-4" /> Add sticky
          </Button>
        </div>
      </div>

      <div
        ref={boardRef}
        className="relative min-h-[70vh] overflow-hidden rounded-2xl border border-border bg-surface-2/50"
        style={{
          backgroundImage:
            "radial-gradient(var(--border) 1px, transparent 1px)",
          backgroundSize: `${GRID * 2}px ${GRID * 2}px`,
        }}
        aria-label="Vision board canvas"
      >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && items.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
            <StickyNote className="size-8 text-primary-soft" />
            <p className="text-sm text-muted-foreground">
              Your board is empty. Add a sticky goal or drop an image to get started.
            </p>
            <Button onClick={addSticky}>
              <Plus className="size-4" /> Add your first sticky
            </Button>
          </div>
        )}

        {items.map((item) => (
          <BoardItem
            key={item.id}
            item={item}
            onDragEnd={onDragEnd(item)}
            onEditText={editText}
            onDelete={() => removeItem.mutate(item.id)}
          />
        ))}
      </div>
    </div>
  );
}

function BoardItem({ item, onDragEnd, onEditText, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const isImage = item.kind === "image";

  // keep the draft in sync if the server value changes underneath us
  useEffect(() => {
    setDraft(item.text);
  }, [item.text]);

  const commit = () => {
    if (draft !== item.text) onEditText(item, draft);
  };

  return (
    <motion.div
      drag
      dragMomentum={false}
      dragElastic={0}
      dragConstraints={{ left: -4000, top: -4000, right: 6000, bottom: 6000 }}
      onDragEnd={onDragEnd}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
      className={cn(
        "absolute cursor-grab active:cursor-grabbing select-none",
        "shadow-[var(--shadow-md)] transition-shadow hover:shadow-[var(--shadow-lg)]"
      )}
      style={{
        left: item.x,
        top: item.y,
        width: item.width,
        height: isImage ? undefined : item.height,
        rotate: `${item.rotation}deg`,
        zIndex: item.z_index + 10,
      }}
      role="group"
      aria-label={isImage ? "Image on vision board" : "Sticky note"}
    >
      {isImage ? (
        <div className="relative overflow-hidden rounded-lg border border-border bg-card">
          {item.image_url ? (
            <img
              src={item.image_url}
              alt={item.text || "Vision board image"}
              draggable={false}
              className="block h-auto w-full object-cover"
            />
          ) : (
            <div className="flex h-40 w-full items-center justify-center text-xs text-muted-foreground">
              Image unavailable
            </div>
          )}
        </div>
      ) : (
        <div
          className="h-full w-full rounded-lg p-3 shadow-inner"
          style={{ background: item.color }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setHovered(true)}
            onBlur={commit}
            placeholder="Your goal…"
            aria-label="Sticky text"
            className="h-full w-full resize-none bg-transparent text-sm font-medium leading-snug text-[#3b2f2a] outline-none placeholder:text-[#3b2f2a]/50"
            style={{ pointerEvents: hovered ? "auto" : "none" }}
            onPointerDown={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete item"
        title="Delete"
        className={cn(
          "absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-destructive focus-visible:opacity-100",
          hovered && "opacity-100"
        )}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Trash2 className="size-3.5" />
      </button>
    </motion.div>
  );
}
