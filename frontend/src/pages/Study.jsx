import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquare,
  Plus,
  RotateCcw,
  Search,
  ThumbsDown,
  ThumbsUp,
  X,
  Loader,
  Flame,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { studyApi } from "@/services/api-services";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { enqueueReview } from "@/lib/offline-queue";
import { useReviewQueueSync } from "@/hooks/usePwa";
import { useHaptics, usePullToRefresh, useSwipe } from "@/hooks/useGestures";

const REVIEW_RATINGS = [
  { value: 1, label: "Again", desc: "Complete blackout", className: "bg-destructive/10 text-destructive border-destructive/30" },
  { value: 2, label: "Hard", desc: "Recalled with difficulty", className: "bg-warning-bg text-warning border-warning/30" },
  { value: 3, label: "Good", desc: "Recalled comfortably", className: "bg-success-bg text-success border-success/30" },
  { value: 4, label: "Easy", desc: "Perfect recall", className: "bg-primary/10 text-primary border-primary/30" },
];

// A swipe is a coarse gesture with no undo, so it only offers the two verdicts a
// thumb can commit to without looking. Hard/Easy stay on the buttons — a
// mis-tap is one undo away, a mis-swipe silently reschedules the card.
const SWIPE_RATINGS = { left: 1, right: 3 };

function ReviewCard({ card, onReview, onReveal, flipSignal, loadingRating, busy, reducedMotion }) {
  const [showBack, setShowBack] = useState(false);
  const buzz = useHaptics(!reducedMotion);

  const setFace = useCallback(
    (next) => {
      setShowBack(next);
      onReveal?.(card.id, next);
    },
    [card.id, onReveal]
  );

  const flip = useCallback(() => {
    buzz(8);
    setFace(!showBack);
  }, [buzz, setFace, showBack]);

  // `f` lives on the page so it can act on the first card; it signals through a
  // counter rather than a ref because the keyboard handler belongs to Study, not
  // to this card.
  const flipRef = useRef(flip);
  flipRef.current = flip;
  useEffect(() => {
    if (flipSignal > 0) flipRef.current();
  }, [flipSignal]);

  // Only arm the swipe once the answer is visible. Grading a card you haven't
  // read the answer to is the one mistake spaced repetition can't recover from,
  // and a horizontal drag is easy to start by accident.
  const swipe = useSwipe({
    enabled: showBack && !busy,
    threshold: 80,
    onSwipe: (dir) => {
      buzz(18);
      onReview(SWIPE_RATINGS[dir]);
    },
  });

  // Browsers fire `click` after `pointerup` even when the pointer travelled, so
  // a swipe that begins on the prompt text would also flip the card. Suppress
  // the click when the last gesture actually moved.
  const guardClick = useCallback(
    (fn) => () => {
      if (swipe.travel.current > 10) return;
      fn();
    },
    [swipe.travel]
  );

  // Preview the verdict a completed swipe would commit to, while still holding
  // the card — the gesture stays reversible right up to release.
  const pending =
    showBack && !busy && Math.abs(swipe.dx) > 12 ? (swipe.dx < 0 ? 1 : 3) : null;
  const pendingMeta = pending ? REVIEW_RATINGS.find((r) => r.value === pending) : null;

  const grade = (rating) => {
    if (busy) return;
    buzz(12);
    onReview(rating);
  };

  return (
    <Card
      {...swipe.bind}
      style={swipe.swiping ? { transform: `translateX(${swipe.dx}px)` } : undefined}
      className={cn(
        "relative overflow-hidden space-y-4 p-4 select-none",
        // `pan-y` keeps native vertical scrolling but hands horizontal movement
        // to us — without it the pointer events never reach the card at all.
        showBack && !busy ? "cursor-grab touch-pan-y" : "cursor-default"
      )}
    >
      {pendingMeta ? (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 flex items-center justify-center gap-2 border-2",
            pending === 1
              ? "border-destructive/60 bg-destructive/10"
              : "border-success/60 bg-success/10"
          )}
        >
          {pending === 1 ? (
            <ThumbsDown className="size-5 text-destructive" />
          ) : (
            <ThumbsUp className="size-5 text-success" />
          )}
          <span
            className={cn(
              "text-sm font-semibold",
              pending === 1 ? "text-destructive" : "text-success"
            )}
          >
            {pendingMeta.label}
          </span>
        </div>
      ) : null}

      <div className="space-y-2">
        {/*
          The prompt is the flip control. It used to be an onClick on the whole
          card with role="button", which nested the four rating buttons inside a
          button — invalid markup, and it collapsed eight separate controls into
          one flat target for screen readers.
        */}
        <button
          type="button"
          onClick={guardClick(flip)}
          aria-expanded={showBack}
          className="w-full rounded-sm text-left text-sm font-medium leading-snug focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
        >
          {showBack ? card.back : card.front}
          <span className="sr-only">
            {showBack
              ? " — answer shown. Activate to hide it."
              : " — question shown. Activate to reveal the answer."}
          </span>
        </button>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {card.space_title ? <span>{card.space_title}</span> : null}
          {card.tags?.length ? (
            <span className="rounded bg-surface-2 px-1.5 py-0.5">{card.tags[0]}</span>
          ) : null}
        </div>
      </div>

      <div className="border-t border-border pt-2">
        {showBack ? (
          <div className="space-y-2">
            <div className="grid grid-cols-4 gap-2">
              {REVIEW_RATINGS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => grade(r.value)}
                  disabled={busy || loadingRating === r.value}
                  aria-label={`${r.label} — ${r.desc}`}
                  className={cn(
                    "rounded-lg border py-2 text-sm font-medium transition-colors",
                    r.className,
                    (busy || loadingRating === r.value) && "opacity-70"
                  )}
                >
                  {loadingRating === r.value ? (
                    <Loader className="mx-auto size-4 animate-spin" />
                  ) : (
                    r.label
                  )}
                </button>
              ))}
            </div>
            <p className="text-center text-[11px] text-muted-foreground">
              Or swipe left for Again, right for Good
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={guardClick(() => setFace(false))}
              className="w-full"
            >
              <RotateCcw className="mr-1 size-4" /> Show question again
            </Button>
          </div>
        ) : (
          <Button className="w-full" onClick={flip}>
            <MessageSquare className="mr-2 size-4" /> Show answer
          </Button>
        )}
      </div>
    </Card>
  );
}

export default function Study() {
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showStats, setShowStats] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  // Which cards are showing their answer, and the counter `f` bumps to reveal
  // the first one. Both exist because grading a card you can't see is the one
  // mistake FSRS can't recover from.
  const [revealed, setRevealed] = useState(() => new Set());
  const [flipSignal, setFlipSignal] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  const { data: due } = useQuery({
    queryKey: ["study", "due"],
    queryFn: studyApi.due,
    refetchInterval: 30_000,
  });

  const { pending, flush } = useReviewQueueSync();

  const refreshDue = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["study", "due"] });
  }, [queryClient]);

  const pull = usePullToRefresh({ onRefresh: refreshDue });

  // Grades are written to IndexedDB first, then replayed to the API. A failed
  // flush leaves the entry queued rather than dropping the grade, so the FSRS
  // interval can't silently desync from what the student actually answered.
  const reviewMutation = useMutation({
    mutationFn: async ({ cardId, rating }) => {
      const entry = {
        card_id: cardId,
        rating,
        graded_at: new Date().toISOString(),
        duration_ms: null,
      };
      if (!navigator.onLine) {
        await enqueueReview(entry);
        return { queued: true };
      }
      try {
        return await studyApi.review({ card_id: cardId, rating });
      } catch (err) {
        // A transport failure means we're effectively offline — queue it.
        if (err?.status === 0) {
          await enqueueReview(entry);
          return { queued: true };
        }
        throw err;
      }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["study", "due"] });
      if (result?.queued) {
        success("Saved offline — it will sync when you're back online.");
      } else {
        success("Card reviewed!");
      }
    },
    onError: (err) => error(err),
  });

  const dueCards = useMemo(() => due?.cards ?? [], [due]);
  const needle = search.trim().toLowerCase();
  const filteredCards = useMemo(
    () =>
      !needle
        ? dueCards
        : dueCards.filter(
            (c) =>
              c.front.toLowerCase().includes(needle) ||
              c.back.toLowerCase().includes(needle)
          ),
    [dueCards, needle]
  );

  // Stats
  const dueCount = due?.due_count ?? 0;
  const newCount = due?.new_count ?? 0;
  const learningCount = due?.learning_count ?? 0;
  const reviewCount = due?.review_count ?? 0;
  const totalCards = due?.total_cards ?? 0;
  const totalLapses = useMemo(
    () => dueCards.reduce((sum, c) => sum + (c.lapses || 0), 0),
    [dueCards]
  );

  const grade = useCallback(
    (cardId, rating) => reviewMutation.mutate({ cardId, rating }),
    [reviewMutation]
  );

  const markRevealed = useCallback((cardId, isShown) => {
    setRevealed((prev) => {
      if (prev.has(cardId) === isShown) return prev;
      const next = new Set(prev);
      if (isShown) next.add(cardId);
      else next.delete(cardId);
      return next;
    });
  }, []);

  // One keydown listener for the whole page. It used to live inside ReviewCard,
  // so it was registered once per card: with 20 cards due, pressing "1" graded
  // all twenty at once and there was nothing scoping it to the focused card.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target;
      // Never steal keys from a field the user is typing in.
      if (target instanceof HTMLElement) {
        if (
          target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
        ) {
          return;
        }
      }
      const key = e.key.toLowerCase();
      if (key === "f") {
        if (filteredCards.length === 0) return;
        e.preventDefault();
        setFlipSignal((n) => n + 1);
        return;
      }
      if (key >= "1" && key <= "4") {
        const card = filteredCards.find((c) => revealed.has(c.id));
        if (!card) return;
        e.preventDefault();
        grade(card.id, Number(key));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filteredCards, grade, revealed]);

  return (
    <div
      ref={pull.ref}
      {...pull.bind}
      className="mx-auto max-w-4xl space-y-6"
      style={{ touchAction: "pan-y" }}
    >
      {pull.pullDistance > 0 ? (
        <div
          aria-hidden
          className="flex justify-center pt-1"
          style={{ opacity: pull.indicator.opacity }}
        >
          <RotateCcw
            className={cn("size-4", pull.refreshing && "animate-spin")}
            style={{
              transform: pull.indicator.transform,
              color: pull.indicator.armed ? "var(--color-primary)" : undefined,
            }}
          />
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Review</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {dueCount} cards due · {newCount} new · {learningCount} learning ·{" "}
            {reviewCount} review
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refreshDue}>
          <RotateCcw className="mr-1 size-4" /> Refresh
        </Button>
      </div>

      {pending > 0 ? (
        <Card className="flex items-center justify-between gap-3 border-warning/40 bg-warning/10 p-3">
          <p className="text-xs text-warning">
            {pending} review{pending === 1 ? "" : "s"} saved on this device and waiting to
            sync.
          </p>
          <Button size="sm" variant="outline" onClick={() => flush()}>
            Sync now
          </Button>
        </Card>
      ) : null}

      <div className="mb-4 flex items-center justify-between gap-2">
        {showStats ? (
          <span className="text-sm font-medium">Review stats</span>
        ) : (
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Filter due cards"
              placeholder="Filter due cards…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={showStats}
          onClick={() => setShowStats((v) => !v)}
        >
          <Flame className="size-4" /> Stats
        </Button>
      </div>

      {showStats ? (
        <StatsCard
          dueCount={dueCount}
          newCount={newCount}
          learningCount={learningCount}
          reviewCount={reviewCount}
          totalCards={totalCards}
          retention={due?.retention}
          retentionWindowDays={due?.retention_window_days ?? 30}
          totalLapses={totalLapses}
          onClose={() => setShowStats(false)}
        />
      ) : null}

      {filteredCards.length === 0 ? (
        <Card className="p-8 text-center">
          <CheckCircle2 className="mx-auto mb-3 size-12 text-success" />
          <h3 className="text-lg font-semibold">
            {dueCards.length === 0 ? "All caught up!" : "No cards match that filter"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {dueCards.length === 0
              ? "No cards due right now. Check back later or generate flashcards in Studio."
              : "Clear the filter to see the rest of the queue."}
          </p>
        </Card>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Tip: press <kbd className="rounded border px-1 font-mono">F</kbd> to reveal the
            first card, then <kbd className="rounded border px-1 font-mono">1</kbd>–
            <kbd className="rounded border px-1 font-mono">4</kbd> to grade it.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <AnimatePresence mode="popLayout">
              {filteredCards.map((card, index) => (
                <motion.div
                  key={card.id}
                  initial={reducedMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
                  transition={{ duration: reducedMotion ? 0 : 0.2 }}
                >
                  <ReviewCard
                    card={card}
                    reducedMotion={reducedMotion}
                    busy={reviewMutation.isPending}
                    flipSignal={index === 0 ? flipSignal : 0}
                    onReveal={markRevealed}
                    onReview={(rating) => grade(card.id, rating)}
                    loadingRating={
                      reviewMutation.variables?.cardId === card.id
                        ? reviewMutation.variables.rating
                        : null
                    }
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </>
      )}

      {dueCards.length > 0 ? (
        <div className="mt-6 rounded-lg border border-border bg-surface-2 p-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Due</p>
              <p className="text-2xl font-bold">{dueCount}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">New</p>
              <p className="text-2xl font-bold text-primary">{newCount}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Lapses</p>
              <p className="text-2xl font-bold text-destructive">{totalLapses}</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatsCard({
  dueCount,
  newCount,
  learningCount,
  reviewCount,
  totalCards,
  retention,
  retentionWindowDays,
  totalLapses,
  onClose,
}) {
  const hasRetention = retention !== null && retention !== undefined;

  return (
    <div className="relative mx-auto max-w-2xl space-y-6 rounded-xl border border-border bg-card p-6">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
      >
        <X className="size-4" />
        <span className="sr-only">Close stats</span>
      </button>

      <div className="mb-6 flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">Review Stats</h2>
        <span className="font-mono text-xs text-muted-foreground">
          {totalCards} cards in deck
        </span>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4">
        <StatItem
          label="Due now"
          value={dueCount}
          icon="Clock"
          className="text-primary"
        />
        <StatItem
          label={`Recall (${retentionWindowDays}d)`}
          // This used to be `review_count / total_cards`, which is the share of
          // the deck that is mature — not retention at all. It read 0% for a new
          // user and 100% for anyone with a full backlog.
          value={hasRetention ? `${Math.round(retention * 100)}%` : "—"}
          hint={hasRetention ? null : "No reviews in this window"}
          icon="CheckCircle2"
          className={
            !hasRetention
              ? "text-muted-foreground"
              : retention >= 0.8
                ? "text-success"
                : retention >= 0.6
                  ? "text-warning"
                  : "text-destructive"
          }
        />
        <StatItem
          label="Lapses"
          value={totalLapses}
          icon="AlertCircle"
          className="text-destructive"
        />
      </div>

      <hr className="my-6" />

      <div className="space-y-3">
        <StatItem label="New cards" value={newCount} icon="Plus" className="text-primary" />
        <StatItem
          label="Learning"
          value={learningCount}
          icon="Loader"
          className="text-warning"
        />
        <StatItem
          label="Reviews"
          value={reviewCount}
          icon="Clock"
          className="text-success"
        />
      </div>

      <hr className="my-6" />

      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Recall rate</p>
        <div className="h-2 w-full rounded-lg bg-surface-2">
          <div
            className="h-full rounded-lg bg-primary"
            style={{ width: `${hasRetention ? Math.round(retention * 100) : 0}%` }}
          />
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          {hasRetention
            ? `Share of your last ${retentionWindowDays} days of reviews rated Good or Easy.`
            : "Grade a few cards to see how often you actually recall them."}
        </p>
      </div>
    </div>
  );
}

function StatItem({ label, value, hint, icon, className }) {
  const Icon = { Clock, CheckCircle2, Plus, Loader2, AlertCircle }[icon] ?? Plus;

  return (
    <div className="flex items-center gap-2">
      <Icon className={cn("size-4", className)} aria-hidden />
      <span className="flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="text-2xl font-bold">{value}</p>
        {hint ? <p className="text-[10px] text-muted-foreground">{hint}</p> : null}
      </span>
    </div>
  );
}
