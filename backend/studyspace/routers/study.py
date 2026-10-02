"""Study endpoints: due queue + FSRS reviews."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from studyspace.deps import DbDep, UserDep
from studyspace.models.study import CardOut, DueOut, ReviewIn, ReviewOut
from studyspace.services import fsrs_scheduler as fsrs

router = APIRouter(prefix="/study", tags=["study"])

_CARD_SELECT = """
select c.id, c.space_id, sp.title as space_title, c.front, c.back, c.tags,
       c.source_chunk_id, c.created_at,
       cs.due, cs.state, cs.reps, cs.lapses, cs.stability, cs.difficulty
from public.cards c
join public.spaces sp on sp.id = c.space_id
left join public.card_state cs on cs.card_id = c.id
where c.user_id = auth.uid()
"""


def _state_name(value) -> str:
    if value is None:
        return "learning"
    if isinstance(value, str):
        return value
    return fsrs.STATE_NAMES.get(int(value), "learning")


def _card_out(row) -> CardOut:
    return CardOut(
        id=row["id"],
        space_id=row["space_id"],
        space_title=row["space_title"],
        front=row["front"],
        back=row["back"],
        tags=list(row["tags"] or []),
        source_chunk_id=row["source_chunk_id"],
        created_at=row["created_at"],
        due=row["due"],
        state=_state_name(row["state"]),
        reps=row["reps"] or 0,
        lapses=row["lapses"] or 0,
        stability=float(row["stability"] or 0.0),
        difficulty=float(row["difficulty"] or 0.0),
    )


@router.get("/due", response_model=DueOut)
async def due_cards(db: DbDep, limit: int = 50) -> DueOut:
    rows = await db.fetch(
        _CARD_SELECT + " order by cs.due nulls first limit $1",
        min(max(limit, 1), 200),
    )
    now = datetime.now(timezone.utc)
    cards = []
    for r in rows:
        if r["due"] is not None and r["due"] <= now:
            cards.append(_card_out(r))
    counts = await db.fetchrow(
        "select count(*) filter (where cs.due <= now() and cs.state = 0)::int as learning, "
        "count(*) filter (where cs.due <= now() and cs.state = 1)::int as review, "
        "count(*) filter (where cs.due <= now())::int as due, "
        "count(*) filter (where cs.state = 0 and cs.reps = 0)::int as fresh, "
        "count(*)::int as total "
        "from public.card_state cs join public.cards c on c.id = cs.card_id "
        "where cs.user_id = auth.uid() and not cs.suspended"
    )
    return DueOut(
        due_count=counts["due"],
        new_count=counts["fresh"],
        learning_count=counts["learning"],
        review_count=counts["review"],
        total_cards=counts["total"],
        cards=cards,
    )


@router.get("/cards", response_model=list[CardOut])
async def list_cards(db: DbDep, space_id: uuid.UUID | None = None) -> list[CardOut]:
    if space_id:
        rows = await db.fetch(_CARD_SELECT + " and c.space_id = $1 order by c.created_at desc limit 500", space_id)
    else:
        rows = await db.fetch(_CARD_SELECT + " order by c.created_at desc limit 500")
    return [_card_out(r) for r in rows]


@router.post("/review", response_model=ReviewOut)
async def review_card(body: ReviewIn, db: DbDep, user: UserDep) -> ReviewOut:
    row = await db.fetchrow(
        "select cs.card_id, cs.due, cs.stability, cs.difficulty, cs.state, cs.step, cs.reps, "
        "cs.lapses, cs.last_review "
        "from public.card_state cs join public.cards c on c.id = cs.card_id "
        "where cs.card_id = $1 and cs.user_id = auth.uid()",
        body.card_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Card not found.")

    before = fsrs.CardSnapshot(
        due=row["due"],
        stability=float(row["stability"] or 0),
        difficulty=float(row["difficulty"] or 0),
        state=int(row["state"] or 0),
        step=int(row["step"] or 0),
        reps=int(row["reps"] or 0),
        lapses=int(row["lapses"] or 0),
        last_review=row["last_review"],
    )
    outcome = fsrs.review(before, body.rating)
    after = outcome.snapshot

    await db.execute(
        "insert into public.review_logs (user_id, card_id, rating, state_before, state_after, "
        "due_before, due_after, duration_ms) values ($1, $2, $3, $4, $5, $6, $7, $8)",
        user.id,
        body.card_id,
        body.rating,
        json.dumps(before.to_dict()),
        json.dumps(after.to_dict()),
        before.due,
        after.due,
        body.duration_ms,
    )
    await db.execute(
        "update public.card_state set due = $2, stability = $3, difficulty = $4, state = $5, "
        "step = $6, reps = $7, lapses = $8, last_review = $9, updated_at = now() "
        "where card_id = $1 and user_id = auth.uid()",
        body.card_id,
        after.due,
        after.stability,
        after.difficulty,
        after.state,
        after.step,
        after.reps,
        after.lapses,
        after.last_review,
    )
    remaining = await db.fetchval(
        "select count(*) from public.card_state where user_id = auth.uid() and due <= now() and not suspended"
    )
    return ReviewOut(
        card_id=body.card_id,
        rating=body.rating,
        due=after.due,
        state=fsrs.STATE_NAMES.get(after.state, "learning"),
        stability=after.stability,
        difficulty=after.difficulty,
        reps=after.reps,
        lapses=after.lapses,
        interval_days=round(outcome.interval_days, 3),
        due_count=int(remaining or 0),
    )


@router.delete("/cards/{card_id}", status_code=204)
async def delete_card(db: DbDep, card_id: uuid.UUID) -> None:
    result = await db.execute(
        "delete from public.cards where id = $1 and user_id = auth.uid()", card_id
    )
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Card not found.")
