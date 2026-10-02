"""FSRS spaced-repetition scheduling.

Thin adapter over the `fsrs` Python package so table storage stays plain
columns and the scheduler implementation stays swappable. Ratings:
1 = Again, 2 = Hard, 3 = Good, 4 = Easy (text labels are always shown in UI).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any

STATE_NAMES = {0: "learning", 1: "review", 2: "relearning"}
RATING_NAMES = {1: "again", 2: "hard", 3: "good", 4: "easy"}


@dataclass
class CardSnapshot:
    """Row shape of `public.card_state`."""

    due: datetime
    stability: float = 0.0
    difficulty: float = 0.0
    state: int = 0
    step: int = 0
    reps: int = 0
    lapses: int = 0
    last_review: datetime | None = None

    @property
    def state_name(self) -> str:
        return STATE_NAMES.get(self.state, "learning")

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["due"] = self.due.isoformat() if self.due else None
        data["last_review"] = self.last_review.isoformat() if self.last_review else None
        data["state"] = self.state_name
        return data


def _scheduler():
    from fsrs import Scheduler  # imported lazily so tests can stub it

    return Scheduler()


def _to_fsrs_card(snapshot: CardSnapshot):
    from fsrs import Card, State

    card = Card()
    card.due = snapshot.due
    card.stability = float(snapshot.stability) if snapshot.stability else None
    card.difficulty = float(snapshot.difficulty) if snapshot.difficulty else None
    card.state = [State.Learning, State.Review, State.Relearning][min(max(snapshot.state, 0), 2)]
    card.reps = int(snapshot.reps)
    card.lapses = int(snapshot.lapses)
    if snapshot.last_review:
        card.last_review = snapshot.last_review
    return card


def _state_value(state: Any) -> int:
    from fsrs import State

    order = {State.Learning: 0, State.Review: 1, State.Relearning: 2}
    if isinstance(state, int):
        return state
    return order.get(state, 0)


@dataclass
class ReviewOutcome:
    snapshot: CardSnapshot
    rating: int
    interval_days: float
    review_log: dict[str, Any]


def review(snapshot: CardSnapshot, rating: int, *, now: datetime | None = None) -> ReviewOutcome:
    """Apply a review rating and return the new scheduling state + log meta."""
    if rating not in RATING_NAMES:
        raise ValueError("Rating must be 1 (Again), 2 (Hard), 3 (Good) or 4 (Easy).")

    from fsrs import Rating

    rating_enum = {1: Rating.Again, 2: Rating.Hard, 3: Rating.Good, 4: Rating.Easy}[rating]
    scheduler = _scheduler()
    card = _to_fsrs_card(snapshot)

    # py-fsrs API differs slightly across versions; support both shapes.
    result = None
    if hasattr(scheduler, "review_card"):
        result = scheduler.review_card(card, rating_enum, review_datetime=now or datetime.now(timezone.utc))
    elif hasattr(scheduler, "review"):
        result = scheduler.review(card, rating_enum, review_datetime=now or datetime.now(timezone.utc))

    if isinstance(result, tuple):
        new_card, log = result
    else:
        new_card, log = card, getattr(card, "last_log", None)

    due = new_card.due
    if due is not None and getattr(due, "tzinfo", None) is None:
        due = due.replace(tzinfo=timezone.utc)
    last_review = getattr(new_card, "last_review", None)
    if last_review is not None and getattr(last_review, "tzinfo", None) is None:
        last_review = last_review.replace(tzinfo=timezone.utc)

    snapshot = CardSnapshot(
        due=due or datetime.now(timezone.utc),
        stability=float(getattr(new_card, "stability", 0.0) or 0.0),
        difficulty=float(getattr(new_card, "difficulty", 0.0) or 0.0),
        state=_state_value(getattr(new_card, "state", 0)),
        step=int(getattr(new_card, "step", 0) or 0),
        reps=int(snapshot.reps) + 1,
        lapses=int(snapshot.lapses) + (1 if rating == 1 else 0),
        last_review=last_review,
    )

    now_ref = now or datetime.now(timezone.utc)
    interval = (snapshot.due - now_ref).total_seconds() / 86400.0
    log_meta = {
        "rating": rating,
        "rating_name": RATING_NAMES[rating],
        "state": snapshot.state_name,
        "stability": snapshot.stability,
        "difficulty": snapshot.difficulty,
        "interval_days": round(interval, 4),
    }
    return ReviewOutcome(snapshot=snapshot, rating=rating, interval_days=interval, review_log=log_meta)


def fresh_snapshot(due: datetime | None = None) -> CardSnapshot:
    return CardSnapshot(due=due or datetime.now(timezone.utc))
