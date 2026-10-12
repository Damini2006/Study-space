/**
 * Vision Board — multiple named boards, drag stickies and images,
 * grid/list views, and SVG export. Images go to the private `vision`
 * bucket and render through short‑lived signed URLs.
 */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ImagePlus, Loader2, Pencil, Plus, StickyNote, Trash2, Eye } from "lucide-react";
import { visionApi } from "@/services/api-services";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Dialog, Select } from "@/components/ui/dialog";
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
  const [currentBoardId, setCurrentBoardId] = useState(null);
  const [renameBoardId, setRenameBoardId] = useState(null);
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");

  const { data: boards = [] } = useQuery({
    queryKey: ["vision-boards"],
    queryFn: () => visionApi.boards.list(),
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["vision-items", currentBoardId],
    queryFn: () => (currentBoardId ? visionApi.list(currentBoardId) : visionApi.list()),
  });

  const createBoard = useMutation({
    mutationFn: (body) => visionApi.boards.create(body),
    onSuccess: (board) => {
      setCurrentBoardId(board.id);
      qc.invalidateQueries({ queryKey: ["vision-boards"] });
      success("Board created.");
    },
    onError: (e) => toastError(e.message || "Could not create board."),
  });

  const renameBoard = useMutation({
    mutationFn: ({ id, name }) => visionApi.boards.rename(id, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vision-boards"] });
      success("Board renamed.");
    },
    onError: (e) => toastError(e.message || "Could not rename board."),
  });

  const deleteBoard = useMutation({
    mutationFn: (id) => visionApi.boards.delete(id),
    onSuccess: () => {
      setCurrentBoardId(null);
      qc.invalidateQueries({ queryKey: ["vision-boards"] });
      qc.invalidateQueries({ queryKey: ["vision-items"] });
      success("Board deleted.");
    },
    onError: (e) => toastError(e.message || "Could not delete board."),
  });

  // --- Item CRUD mutations (unchanged behaviour) ---
  const createItem = useMutation({
    mutationFn: (body) => visionApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vision-items"] }),
    onError: (e) => toastError(e.message || "Could not add that sticky."),
  });

  const patchItem = useMutation({
    mutationFn: ({ id, body }) => visionApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vision-items"] }),
    onError: (e) => toastError(e.message || "Could not save that move."),
  });

  const removeItem = useMutation({
    mutationFn: (id) => visionApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vision-items"] });
      success("Removed from board.");
    },
    onError: (e) => toastError(e.message || "Could not remove that item."),
  });

  // --- Export (SVG) ---
  const exportSvg = useMutation({
    mutationFn: (boardId) => visionApi.export(boardId),
    onSuccess: (svg) => {
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${currentBoardId ? "board" : "untitled"}.svg`;
      a.click();
      URL.revokeObjectURL(url);
      success("Board exported as SVG.");
    },
    onError: (e) => toastError(e.message || "Export failed."),
  });

  // --- Board UI state ---
  // Every board is offered as a destination; `Select` shows the item's
  // current board as the selected option and moves it when changed.
  const boardOptions = boards.map((b) => ({ value: b.id, label: b.name }));

  const addSticky = () => {
    const next = items.length;
    const x = snap(40 + (next % 4) * 230);
    const y = snap(40 + Math.floor(next / 4) * 190);
    createItem.mutate({
      kind: "sticky",
      text: "New goal…",
      color: STICKY_COLORS[next % STICKY_COLORS.length],
      x,
      y,
      z_index: next,
      board_id: currentBoardId,
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
      qc.invalidateQueries({ queryKey: ["vision-items"] });
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

  const handleCreate = () => {
    const name = newBoardName.trim();
    if (!name) return;
    createBoard.mutate({ name });
    setCreatingBoard(false);
    setNewBoardName("");
  };

  const handleRename = () => {
    if (!renameBoardId) return;
    renameBoard.mutate({ id: renameBoardId, name: newBoardName.trim() });
    setRenameBoardId(null);
    setNewBoardName("");
  };

  const moveItem = (item, boardId) => {
    patchItem.mutate({ id: item.id, body: { board_id: boardId || null } });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Vision Board
            {currentBoardId && (
              <span className="ml-2 text-sm text-muted-foreground">
                {boards.find((b) => b.id === currentBoardId)?.name || "Board"}
              </span>
            )}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Drag stickies and images around — everything autosaves.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Board switcher. A null `currentBoardId` means every item on the
              canvas at once; picking a board scopes the canvas to it, which is
              also what Export SVG and Delete act on. Previously this control
              only ever opened the rename dialog, so a board created on an
              earlier visit could never be reopened. */}
          <Select
            value={currentBoardId || ""}
            onValueChange={(id) => setCurrentBoardId(id || null)}
            options={[{ value: "", label: "All boards" }, ...boardOptions]}
            ariaLabel="Switch vision board"
            className="h-9 w-44"
          />

          {/* Rename board */}
          {currentBoardId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRenameBoardId(currentBoardId)}
            >
              <Pencil className="size-3.5" /> Rename
            </Button>
          )}

          {/* Add board button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setNewBoardName("");
              setCreatingBoard(true);
            }}
          >
            <Plus className="size-3.5" /> Add board
          </Button>

          {/* Delete board */}
          {currentBoardId && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (confirm("Delete this board? Its items will be removed.")) {
                  deleteBoard.mutate(currentBoardId);
                }
              }}
            >
              <Trash2 className="size-3.5" /> Delete
            </Button>
          )}

          {/* Export SVG */}
          {currentBoardId && (
            <Button variant="outline" size="sm" onClick={() => exportSvg.mutate(currentBoardId)}>
              <Eye className="size-3.5" /> Export SVG
            </Button>
          )}

          {/* Upload image */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={onFiles}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
            Add image
          </Button>
        </div>
      </div>

      {/* Rename board dialog */}
      {renameBoardId && (
        <Dialog
          open
          onClose={() => {
            setRenameBoardId(null);
            setNewBoardName("");
          }}
          title="Rename board"
          footer={
            <>
              <Button variant="outline" onClick={() => setRenameBoardId(null)}>Cancel</Button>
              <Button onClick={handleRename}>Rename</Button>
            </>
          }
        >
          <form
            className="space-y-3"
            onSubmit={e => { e.preventDefault(); handleRename(); }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="board-rename">New board name</Label>
              <Input
                id="board-rename"
                value={newBoardName}
                onChange={(e) => setNewBoardName(e.target.value)}
                placeholder="My board"
                autoFocus
              />
            </div>
          </form>
        </Dialog>
      )}

      {/* Create board dialog */}
      {creatingBoard && (
        <Dialog
          open
          onClose={() => {
            setCreatingBoard(false);
            setNewBoardName("");
          }}
          title="New board"
          description="Give this board a name so you can find it later."
          footer={
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setCreatingBoard(false);
                  setNewBoardName("");
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={!newBoardName.trim()}>
                Create
              </Button>
            </>
          }
        >
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              handleCreate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="board-create">Board name</Label>
              <Input
                id="board-create"
                value={newBoardName}
                onChange={(e) => setNewBoardName(e.target.value)}
                placeholder="My board"
                autoFocus
              />
            </div>
          </form>
        </Dialog>
      )}

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
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center"
          >
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
            onMove={moveItem}
            currentBoardId={currentBoardId}
            boardOptions={boardOptions}
          />
        ))}
      </div>
    </div>
  );
}

function BoardItem({
  item,
  onDragEnd,
  onEditText,
  onDelete,
  onMove,
  currentBoardId,
  boardOptions,
}) {
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

  const handleDelete = () => {
    if (item.board_id !== currentBoardId) return;
    if (confirm("Delete this item?")) onDelete();
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
            className="h-full w-full resize-none bg-transparent text-sm font-medium leading-snug text-[#3b2f2a] outline-hidden placeholder:text-[#3b2f2a]/50"
            style={{ pointerEvents: hovered ? "auto" : "none" }}
            onPointerDown={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {boardOptions.length > 0 && (
        <div
          className={cn(
            "absolute -bottom-2 -left-2 z-10 transition-opacity focus-within:opacity-100",
            hovered ? "opacity-100" : "opacity-0"
          )}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Select
            value={item.board_id}
            onValueChange={(boardId) => onMove(item, boardId)}
            options={boardOptions}
            placeholder="Move to board…"
            ariaLabel="Move item to another board"
            className="h-7 w-36 rounded-full border border-border bg-card px-2 text-xs shadow-xs"
          />
        </div>
      )}

      <button
        type="button"
        onClick={handleDelete}
        aria-label="Delete item"
        title="Delete"
        className={cn(
          "absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground opacity-0 shadow-xs transition-opacity hover:text-destructive focus-visible:opacity-100",
          hovered && "opacity-100"
        )}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Trash2 className="size-3.5" />
      </button>
    </motion.div>
  );
}
