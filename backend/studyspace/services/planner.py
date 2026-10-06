"""LangGraph study planner with a **mandatory human approval step**.

Graph:

    gather_context -> draft_plan -> await_approval --(interrupt)--> commit

``await_approval`` calls LangGraph's ``interrupt()``, so the run pauses with a
checkpoint in Postgres until the user explicitly approves (optionally editing
the ghost tasks) or rejects. Nothing is written to ``plan_tasks`` before that
approval — enforced both by the graph structure and by a test.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import date, timedelta
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt

from studyspace.config import get_settings
from studyspace.services import llm
from studyspace.tracing import span as trace_span

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

class PlannerState(TypedDict, total=False):
    input: dict[str, Any]
    context: dict[str, Any]
    proposal: dict[str, Any]
    decision: dict[str, Any]
    plan_id: str | None
    status: str
    error: str | None


# ---------------------------------------------------------------------------
# Nodes
# ---------------------------------------------------------------------------

async def gather_context(state: PlannerState, *, conn_factory: Callable) -> dict:
    """Collect real study signals: spaces, due load, weak topics, calendar."""
    spec = state.get("input", {})
    settings = get_settings()
    with trace_span("planner.gather_context") as sp:
        async with conn_factory() as conn:
            spaces = await conn.fetch(
                "select id, title, subject from public.spaces where user_id = auth.uid() and not archived"
            )
            weak = await conn.fetch(
                "select t.tag, count(*)::int as reviews, "
                "count(*) filter (where rl.rating = 1)::int as agains "
                "from public.review_logs rl join public.cards c on c.id = rl.card_id "
                "join unnest(c.tags) t on true where rl.user_id = auth.uid() "
                "group by t.tag having count(*) >= 3 "
                "order by (count(*) filter (where rl.rating = 1))::float / count(*) desc limit 8"
            )
            due = await conn.fetchval(
                "select count(*) from public.card_state where user_id = auth.uid() and due <= now()"
            )
            pending = await conn.fetchval(
                "select count(*) from plan_tasks pt join plans p on p.id = pt.plan_id "
                "where pt.user_id = auth.uid() and pt.status = 'pending' and p.status = 'active'"
            )

        space_ids = {str(s["id"]) for s in spaces}
        requested = {str(s) for s in spec.get("space_ids", [])} & space_ids
        context = {
            "spaces": [
                {"id": str(s["id"]), "title": s["title"], "subject": s["subject"]}
                for s in spaces
            ],
            "selected_space_ids": sorted(requested),
            "weak_topics_from_reviews": [
                {"topic": w["tag"], "lapse_rate": round((w["agains"] or 0) / max(w["reviews"], 1), 3),
                 "samples": w["reviews"]}
                for w in weak
            ],
            "declared_weak_topics": spec.get("weak_topics", []),
            "due_cards": int(due or 0),
            "open_tasks": int(pending or 0),
            "horizon_days": settings.planner_horizon_days,
            "max_tasks": settings.planner_max_tasks,
        }
        sp.set_output({"spaces": len(context["spaces"]), "due": context["due_cards"]})
        return {"context": context}


def _valid_space_ids(context: dict) -> set[str]:
    return {s["id"] for s in context.get("spaces", [])}


async def draft_plan(state: PlannerState, *, conn_factory: Callable) -> dict:
    """LLM drafts the proposed tasks (still nothing is committed)."""
    settings = get_settings()
    spec = state.get("input", {})
    context = state.get("context", {})
    allowed = _valid_space_ids(context)
    horizon = int(context.get("horizon_days", 21))
    max_tasks = int(context.get("max_tasks", 14))
    today = date.today()

    exam_lines = [
        f"- {e['subject']}: exam on {e['exam_date']}"
        for e in spec.get("exam_dates", [])
    ]
    avail_lines = [
        f"- weekday {a['weekday']} (0=Mon): {a['minutes']} minutes"
        for a in spec.get("availability", [])
    ]
    weak = sorted(set(context.get("declared_weak_topics", [])) |
                  {w["topic"] for w in context.get("weak_topics_from_reviews", [])})
    space_lines = [
        f"- [{s['id']}] {s['title']} ({s['subject'] or 'general'})"
        for s in context.get("spaces", [])
    ]

    prompt = (
        f"Today is {today.isoformat()} (horizon: {horizon} days, max {max_tasks} tasks).\n\n"
        f"Exam dates:\n" + ("\n".join(exam_lines) or "- none given") + "\n\n"
        "Weekly availability:\n" + ("\n".join(avail_lines) or "- flexible") + "\n\n"
        "Weak topics (from flashcard lapses + student input): "
        + (", ".join(weak) or "none") + "\n\n"
        f"Open tasks already planned: {context.get('open_tasks', 0)}; due flashcards: {context.get('due_cards', 0)}.\n\n"
        f"Available Spaces (use only these ids in space_id):\n" + ("\n".join(space_lines) or "- none") + "\n\n"
        "Draft a realistic study plan. Return JSON ONLY:\n"
        '{"rationale": str, "tasks": [{"title": str, "topic": str, "due": "YYYY-MM-DD", '
        '"duration_min": int, "space_id": "uuid-or-null", "day": str}]}.\n'
        "Rules: sessions are 25-90 minutes; earlier tasks before exams; spread weak topics; "
        f"every due date within {today.isoformat()} and { (today + timedelta(days=horizon)).isoformat() }; "
        "titles start with a verb and name the concrete outcome."
    )

    with trace_span("planner.draft_plan") as sp:
        data = await llm.chat_json(
            [
                {"role": "system", "content": "You are a careful study planner. Return only valid JSON."},
                {"role": "user", "content": prompt},
            ],
            model=settings.litellm_model,
        )

    tasks_out: list[dict[str, Any]] = []
    for t in (data.get("tasks") or [])[: max_tasks * 2]:
        title = str(t.get("title", "")).strip()
        if not title:
            continue
        try:
            due = date.fromisoformat(str(t.get("due", "")))
        except ValueError:
            due = today + timedelta(days=1)
        if due < today:
            due = today
        if due > today + timedelta(days=horizon):
            due = today + timedelta(days=horizon)
        raw_space = t.get("space_id")
        space_id = str(raw_space) if raw_space and str(raw_space) in allowed else None
        try:
            duration = int(t.get("duration_min", 45))
        except (TypeError, ValueError):
            duration = 45
        tasks_out.append(
            {
                "title": title[:300],
                "topic": (str(t.get("topic"))[:120] if t.get("topic") else None),
                "due": due.isoformat(),
                "duration_min": min(max(duration, 15), 180),
                "space_id": space_id,
                "day": (str(t.get("day"))[:12] if t.get("day") else due.strftime("%a")),
            }
        )
        if len(tasks_out) >= max_tasks:
            break

    proposal = {
        "rationale": str(data.get("rationale", ""))[:2000],
        "tasks": tasks_out,
    }
    sp.set_output({"tasks": len(tasks_out)})
    return {"proposal": proposal, "status": "awaiting_approval"}


def await_approval(state: PlannerState, *, conn_factory: Callable) -> dict:
    """LangGraph human-in-the-loop checkpoint: pause until the user decides."""
    decision = interrupt(
        {
            "kind": "approval_required",
            "proposal": state.get("proposal", {}),
            "message": "Review the proposed tasks. Approve to add them to your plan.",
        }
    )
    if not isinstance(decision, dict):
        decision = {"approved": False}
    if not decision.get("approved"):
        return {"decision": decision, "status": "rejected"}
    return {"decision": decision, "status": "approved"}


async def commit(state: PlannerState, *, conn_factory: Callable) -> dict:
    """Write approved tasks — the ONLY place plan_tasks rows are created."""
    decision = state.get("decision") or {}
    tasks = decision.get("tasks")
    if tasks is None:
        tasks = state.get("proposal", {}).get("tasks", [])
    # normalise (approval may send edited GhostTask models)
    normalised: list[dict[str, Any]] = []
    for t in tasks:
        if not isinstance(t, dict):
            t = t.model_dump(mode="json") if hasattr(t, "model_dump") else dict(t)
        title = str(t.get("title", "")).strip()
        if not title:
            continue
        due = t.get("due")
        try:
            due_val = date.fromisoformat(str(due)) if due else None
        except ValueError:
            due_val = None
        normalised.append({**t, "title": title[:300], "due": due_val})
    if not normalised:
        return {"status": "rejected", "error": "No tasks to commit."}

    plan_title = str(decision.get("plan_title") or state.get("input", {}).get("title") or "Study plan")
    with trace_span("planner.commit", metadata={"tasks": len(normalised)}) as sp:
        async with conn_factory() as conn:
            plan_id = await conn.fetchval(
                "insert into public.plans (user_id, title) values (auth.uid(), $1) returning id",
                plan_title[:200],
            )
            for i, t in enumerate(normalised):
                await conn.execute(
                    "insert into public.plan_tasks (user_id, plan_id, title, topic, due, duration_min, "
                    "space_id, source, order_idx, approved_at) "
                    "values (auth.uid(), $1, $2, $3, $4, $5, $6, 'ai', $7, now())",
                    plan_id, t["title"], t.get("topic"), t.get("due"),
                    int(t.get("duration_min", 45)), t.get("space_id"), i,
                )
        sp.set_output({"plan_id": str(plan_id), "tasks": len(normalised)})
    return {"plan_id": str(plan_id), "status": "approved"}


# ---------------------------------------------------------------------------
# Graph factory (bound to a user-scoped connection + checkpoint store)
# ---------------------------------------------------------------------------

def build_graph(*, conn_factory: Callable, checkpointer: Any) -> Any:
    builder = StateGraph(PlannerState)
    builder.add_node("gather_context", lambda s: gather_context(s, conn_factory=conn_factory))
    builder.add_node("draft_plan", lambda s: draft_plan(s, conn_factory=conn_factory))
    builder.add_node("await_approval", lambda s: await_approval(s, conn_factory=conn_factory))
    builder.add_node("commit", lambda s: commit(s, conn_factory=conn_factory))

    builder.add_edge(START, "gather_context")
    builder.add_edge("gather_context", "draft_plan")
    builder.add_edge("draft_plan", "await_approval")
    builder.add_edge("await_approval", "commit")
    builder.add_edge("commit", END)
    return builder.compile(checkpointer=checkpointer)


def run_config(thread_id: str, user_id: str) -> dict:
    return {
        "configurable": {"thread_id": thread_id, "user_id": user_id},
        "recursion_limit": 20,
    }


async def start_run(*, conn_factory: Callable, checkpointer: Any, thread_id: str, user_id: str,
                    spec: dict[str, Any]) -> PlannerState:
    graph = build_graph(conn_factory=conn_factory, checkpointer=checkpointer)
    result = await graph.ainvoke(
        {"input": spec, "status": "running"}, run_config(thread_id, user_id)
    )
    return result


async def resume_run(*, conn_factory: Callable, checkpointer: Any, thread_id: str, user_id: str,
                     decision: dict[str, Any]) -> PlannerState:
    graph = build_graph(conn_factory=conn_factory, checkpointer=checkpointer)
    result = await graph.ainvoke(Command(resume=decision), run_config(thread_id, user_id))
    return result
