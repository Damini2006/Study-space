import { useState } from "react";
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
  X,
  Loader,
  Flame,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { studyApi } from "@/services/api-services";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useRef, useEffect } from "react";

const REVIEW_RATINGS = [
  { value: 1, label: "Again", desc: "Complete blackout", className: "bg-destructive/10 text-destructive border-destructive/30" },
  { value: 2, label: "Hard", desc: "Recalled with difficulty", className: "bg-warning-bg text-warning border-warning/30" },
  { value: 3, label: "Good", desc: "Recalled comfortably", className: "bg-success-bg text-success border-success/30" },
  { value: 4, label: "Easy", desc: "Perfect recall", className: "bg-primary/10 text-primary border-primary/30" },
];

function ReviewButton({ cardId, rating, disabled, onReview }) {
  return (
    <button
      type="button"
      onClick={() => onReview(rating)}
      disabled={disabled}
      className={cn(
        "flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      {rating}
    </button>
  );
}

function ReviewCard({ card, onReview, loadingRating, onFlip }) {
  const [showBack, setShowBack] = useState(false);
  const cardRef = useRef(null);

  useEffect(() => {
    // Handle keyboard navigation
    const handleKeyDown = (e) => {
      if (!showBack) {
        if (e.key >= "1" && e.key <= "4") {
          const rating = parseInt(e.key);
          onReview(rating);
        }
        if (e.key === "f") {
          setShowBack(true);
        }
      } else {
        if (e.key === "Escape") {
          setShowBack(false);
        }
        if (e.key >= "1" && e.key <= "4") {
          const rating = parseInt(e.key);
          onReview(rating);
          setShowBack(false);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showBack, onReview]);

  const handleFlip = () => {
    onFlip?.();
    setShowBack((prev) => !prev);
  };

  return (
    <Card
      ref={cardRef}
      className="p-4 space-y-4 cursor-pointer transition-transform hover:scale-[1.02]"
      onClick={handleFlip}
      role="button"
      aria-label={showBack ? "Show question" : "Show answer"}
    >
      <div className="space-y-2">
        <div className="text-sm font-medium leading-snug">
          {showBack ? card.back : card.front}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {card.space_title && <span>{card.space_title}</span>}
          {card.tags?.length && <span className="px-1.5 py-0.5 rounded bg-surface-2">{card.tags[0]}</span>}
        </div>
      </div>

      <div className="pt-2 border-t border-border">
        {showBack ? (
          <div className="space-y-2">
            <div className="grid grid-cols-4 gap-2">
              {REVIEW_RATINGS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => onReview(r.value)}
                  disabled={loadingRating === r.value}
                  className={cn(
                    "rounded-lg py-2 text-sm font-medium border transition-colors",
                    r.className,
                    loadingRating === r.value && "opacity-70"
                  )}
                >
                  {loadingRating === r.value ? (
                    <Loader className="size-4 animate-spin mx-auto" />
                  ) : (
                    r.label
                  )}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowBack(false)} className="w-full">
              <RotateCcw className="size-4 mr-1" /> Show question again
            </Button>
          </div>
        ) : (
          <Button className="w-full" onClick={() => setShowBack(true)}>
            <MessageSquare className="size-4 mr-2" /> Show answer
          </Button>
        )}
      </div>
    </Card>
  );
}

export default function Study() {
  const { success } = useToast();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [search, setSearch] = useState("");
  const [showStats, setShowStats] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  const { data: due } = useQuery({
    queryKey: ["study", "due"],
    queryFn: studyApi.due,
    refetchInterval: 30_000,
  });

  const reviewMutation = useMutation({
    mutationFn: ({ cardId, rating }) => studyApi.review({ card_id: cardId, rating }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["study", "due"] });
      success("Card reviewed!");
    },
    onError: (err) => {
      // error toast handled by api client
    },
  });

  const dueCards = due?.cards || [];
  const filteredCards = dueCards.filter((c) =>
    c.front.toLowerCase().includes(search.toLowerCase()) ||
    c.back.toLowerCase().includes(search.toLowerCase())
  );

  // Stats computation
  const dueCount = due?.due_count ?? 0;
  const newCount = due?.new_count ?? 0;
  const learningCount = due?.learning_count ?? 0;
  const reviewCount = due?.review_count ?? 0;
  const totalCards = due?.total_cards ?? 0;

  // Calculate retention rate from review logs
  const retentionRate = totalCards > 0 ? Math.round((reviewCount / totalCards) * 100) : 0;
  const avgReps = totalCards > 0 ? Math.round(due?.cards?.reduce((sum, c) => sum + (c.reps || 0), 0) / totalCards) : 0;
  const totalLapses = due?.cards?.reduce((sum, c) => sum + (c.lapses || 0), 0) ?? 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Review</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {dueCount} cards due · {newCount} new · {learningCount} learning · {reviewCount} review
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["study", "due"] })}>
          <RotateCcw className="size-4 mr-1" /> Refresh
        </Button>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Search className="size-4 text-muted-foreground" />
          <Input
            placeholder="Filter due cards…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="View stats">
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
          retentionRate={retentionRate}
          avgReps={avgReps}
          totalLapses={totalLapses}
          onClose={() => setShowStats(false)}
        />
      ) : (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Filter due cards…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      )}

      {filteredCards.length === 0 ? (
        <Card className="p-8 text-center">
          <CheckCircle2 className="size-12 mx-auto text-success mb-3" />
          <h3 className="text-lg font-semibold">All caught up!</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            No cards due right now. Check back later or generate flashcards in Studio.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <AnimatePresence mode="popLayout">
            {filteredCards.map((card) => (
              <motion.div
                key={card.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <ReviewCard
                  card={card}
                  onReview={(rating) => reviewMutation.mutate({ cardId: card.id, rating })}
                  loadingRating={reviewMutation.variables?.cardId === card.id ? reviewMutation.variables.rating : null}
                  onFlip={() => console.log("flip")}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Quick stats bar */}
      {dueCards.length > 0 && (
        <div className="mt-6 p-4 bg-surface-2 rounded-lg border border-border">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Due</p>
              <p className="text-2xl font-bold">{dueCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">New</p>
              <p className="text-2xl font-bold text-primary">{newCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Lapses</p>
              <p className="text-2xl font-bold text-destructive">{totalLapses}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatsCard({ dueCount, newCount, learningCount, reviewCount, totalCards, retentionRate, avgReps, totalLapses, onClose }) {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6 bg-card rounded-xl border border-border">
      <button
      type="button"
      onClick={onClose}
      className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
    >
      <X className="size-4" />
    </button>

    <h2 className="text-xl font-bold tracking-tight mb-6">Review Stats</h2>

    <div className="grid grid-cols-2 gap-4 mb-6">
      <StatItem
        label="Due"
        value={dueCount}
        icon="Clock"
        className="border-primary/20 text-primary"
      />
      <StatItem
        label="Retention"
        value={`${retentionRate}%`}
        icon="CheckCircle2"
        className={`${retentionRate >= 80 ? "text-success" : retentionRate >= 60 ? "text-warning" : "text-destructive"}`}
      />
      <StatItem
        label="Avg. reps"
        value={avgReps}
        icon="Loader2"
        className="text-warning"
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
      <StatItem
        label="New cards"
        value={newCount}
        icon="Plus"
        className="text-primary"
      />
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
      <p className="text-xs text-muted-foreground uppercase tracking-wide">Streak</p>
      <div className="w-full bg-surface-2 rounded-lg h-2">
        <div
          className="h-full bg-primary rounded-lg"
          style={{ width: `${Math.min(retentionRate, 100)}%` }}
        />
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">Retention confidence</p>
    </div>
    </div>
  );
}

function StatItem({ label, value, icon, className }) {
  const Icon = {
    Clock,
    CheckCircle2,
    Plus,
    Loader2,
    AlertCircle,
  }[icon];

  return (
    <div className="flex items-center gap-2">
      <Icon className={cn("size-4", className)} aria-hidden />
      <span className="flex-1">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </span>
    </div>
  );
}