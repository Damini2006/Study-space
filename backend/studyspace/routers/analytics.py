"""Analytics: heatmap, streaks, per-subject time, weak topics, daily quote."""

from __future__ import annotations

import random

from fastapi import APIRouter

from studyspace.deps import DbDep
from studyspace.models.analytics import AnalyticsSummary, HeatmapDay, SubjectTime, WeakTopic

router = APIRouter(prefix="/analytics", tags=["analytics"])

_QUOTES = [
    "Be consistent, not perfect.",
    "Small habits compound into big wins.",
    "Study in short focused bursts.",
    "Teach to learn: explain it aloud.",
    "Focus on progress, not perfection.",
    "The best time to start was yesterday. The next best time is now.",
    "Deep work beats distracted hours every time.",
    "You do not rise to the level of your goals — you fall to the level of your systems.",
]


@router.get("/summary", response_model=AnalyticsSummary)
async def summary(db: DbDep, days: int = 120) -> AnalyticsSummary:
    days = min(max(days, 7), 365)

    focus_rows = await db.fetch(
        "select date_trunc('day', started_at)::date as day, sum(duration_min)::int as minutes, count(*)::int as sessions "
        "from public.focus_sessions where user_id = auth.uid() and kind = 'focus' "
        "and started_at >= now() - ($1::text || ' days')::interval group by 1",
        str(days),
    )
    review_rows = await db.fetch(
        "select date_trunc('day', reviewed_at)::date as day, count(*)::int as reviews "
        "from public.review_logs where user_id = auth.uid() "
        "and reviewed_at >= now() - ($1::text || ' days')::interval group by 1",
        str(days),
    )
    habit_rows = await db.fetch(
        "select log_date as day, count(*)::int as habits from public.habit_logs "
        "where user_id = auth.uid() and log_date >= current_date - ($1::text || ' days')::interval group by 1",
        str(days),
    )

    by_day: dict[str, dict] = {}
    for r in focus_rows:
        key = str(r["day"])
        by_day.setdefault(key, {"day": r["day"], "minutes": 0, "reviews": 0, "habits": 0})
        by_day[key]["minutes"] = r["minutes"] or 0
    for r in review_rows:
        key = str(r["day"])
        by_day.setdefault(key, {"day": r["day"], "minutes": 0, "reviews": 0, "habits": 0})
        by_day[key]["reviews"] = r["reviews"]
    for r in habit_rows:
        key = str(r["day"])
        by_day.setdefault(key, {"day": r["day"], "minutes": 0, "reviews": 0, "habits": 0})
        by_day[key]["habits"] = r["habits"]

    heatmap = [
        HeatmapDay(
            day=v["day"],
            minutes=v["minutes"],
            reviews=v["reviews"],
            habits=v["habits"],
        )
        for v in sorted(by_day.values(), key=lambda v: str(v["day"]))
    ]

    # streak: consecutive days (ending today or yesterday) with any activity
    active_days = {str(h.day) for h in heatmap if (h.minutes or h.reviews or h.habits)}
    from datetime import date, timedelta

    streak = 0
    cursor = date.today()
    if str(cursor) not in active_days:
        cursor -= timedelta(days=1)
    while str(cursor) in active_days:
        streak += 1
        cursor -= timedelta(days=1)

    week_rows = await db.fetch(
        "select coalesce(sum(duration_min), 0)::int as minutes, count(*)::int as sessions "
        "from public.focus_sessions where user_id = auth.uid() and kind = 'focus' "
        "and started_at >= date_trunc('week', now())",
    )
    last_week_rows = await db.fetch(
        "select coalesce(sum(duration_min), 0)::int as minutes "
        "from public.focus_sessions where user_id = auth.uid() and kind = 'focus' "
        "and started_at >= date_trunc('week', now()) - interval '7 days' "
        "and started_at < date_trunc('week', now())",
    )

    counts = await db.fetchrow(
        "select (select count(*) from public.card_state where user_id = auth.uid() and due <= now())::int as due_today, "
        "(select count(*) from public.review_logs where user_id = auth.uid() and reviewed_at >= current_date)::int as reviews_today, "
        "(select count(*) from public.cards where user_id = auth.uid())::int as cards_total",
    )

    subject_rows = await db.fetch(
        "select coalesce(sp.subject, sp.title, 'General') as subject, "
        "sum(f.duration_min)::int as minutes "
        "from public.focus_sessions f left join public.spaces sp on sp.id = f.space_id "
        "where f.user_id = auth.uid() and f.kind = 'focus' "
        "group by 1 order by minutes desc limit 8",
    )

    # Weak topics: tags on cards with the highest "Again" rate in reviews
    weak_rows = await db.fetch(
        "select t.tag, count(*)::int as reviews, "
        "count(*) filter (where rl.rating = 1)::int as agains, "
        "count(distinct rl.card_id)::int as cards "
        "from public.review_logs rl "
        "join public.cards c on c.id = rl.card_id "
        "join unnest(c.tags) as t(tag) on true "
        "where rl.user_id = auth.uid() "
        "group by t.tag having count(*) >= 3 "
        "order by (count(*) filter (where rl.rating = 1))::float / count(*) desc, count(*) desc limit 6",
    )
    weak = [
        WeakTopic(
            topic=r["tag"],
            samples=r["reviews"],
            lapse_rate=round((r["agains"] or 0) / r["reviews"], 3),
        )
        for r in weak_rows
    ]

    import hashlib

    seed = int(hashlib.sha256(date.today().isoformat().encode()).hexdigest(), 16)
    quote = _QUOTES[seed % len(_QUOTES)]

    return AnalyticsSummary(
        heatmap=heatmap,
        streak_days=streak,
        minutes_this_week=week_rows[0]["minutes"],
        minutes_last_week=last_week_rows[0]["minutes"] if last_week_rows else 0,
        focus_sessions_this_week=week_rows[0]["sessions"],
        due_today=counts["due_today"],
        reviews_today=counts["reviews_today"],
        cards_total=counts["cards_total"],
        per_subject=[SubjectTime(subject=r["subject"], minutes=r["minutes"]) for r in subject_rows],
        weak_topics=weak,
        daily_quote=quote,
    )
