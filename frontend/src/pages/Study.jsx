import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  ChevronDown,
  Clock,
  Loader2,
  MessageSquare,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { studyApi, studioApi } from "@/services/api-services";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/toast";
import { cn, formatDate, mdToHtml } from "@/lib/utils";
import { SourceStatusBadge } from "@/components/ui/status-badges";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/dialog";

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

function ReviewCard({ card, onReview, loadingRating }) {
  const [showBack, setShowBack] = useState(false);
  
  return (
    <Card className="p-4 space-y-4">
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
                  {loadingRating === r.value ? <Loader2 className="size-4 animate-spin mx-auto" /> : r.label}
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
  const [search, setSearch] = useState("");
  
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

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Review</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {due?.due_count ?? 0} cards due · {due?.new_count ?? 0} new · {due?.learning_count ?? 0} learning · {due?.review_count ?? 0} review
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["study", "due"] })}>
          <RotateCcw className="size-4 mr-1" /> Refresh
        </Button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Filter due cards…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

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
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}