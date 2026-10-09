"""Integration tests through the FastAPI dependency stack (JWT-authenticated
and claims-aware DB access) against a real Postgres."""

from __future__ import annotations

import pytest
from conftest import headers_for

pytestmark = pytest.mark.asyncio

USER = {"id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "email": "alice@test.dev"}
OTHER = {"id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "email": "bob@test.dev"}


async def test_missing_token_is_401(api_client, migrated_db, two_users):
    resp = await api_client.get("/api/spaces")
    assert resp.status_code == 401
    resp = await api_client.get("/api/spaces", headers={"Authorization": "Bearer junk"})
    assert resp.status_code == 401


async def test_spaces_scoped_to_user(api_client, migrated_db, two_users):
    h = headers_for(USER["id"], USER["email"])
    create = await api_client.post(
        "/api/spaces",
        json={"title": "Biology 201", "subject": "Biology", "color": "#4F5BD5"},
        headers=h,
    )
    assert create.status_code == 201, create.text
    space = create.json()
    assert space["title"] == "Biology 201"

    # listable by owner
    listed = await api_client.get("/api/spaces", headers=h)
    assert listed.status_code == 200
    assert [s["title"] for s in listed.json()] == ["Biology 201"]

    # invisible to bob
    other = await api_client.get("/api/spaces", headers=headers_for(OTHER["id"], OTHER["email"]))
    assert other.json() == []

    # fetch by id as other user -> 404 (row exists but is not theirs; RLS sees nothing)
    fetch_denied = await api_client.get(
        f"/api/spaces/{space['id']}",
        headers=headers_for(OTHER["id"], OTHER["email"]),
    )
    assert fetch_denied.status_code == 404


async def test_validation_errors_are_422_and_clean(api_client, migrated_db, two_users):
    h = headers_for(USER["id"], USER["email"])
    resp = await api_client.post("/api/spaces", json={"title": ""}, headers=h)
    assert resp.status_code == 422
    resp = await api_client.post(
        "/api/spaces", json={"title": "Ok", "color": "not-a-color"}, headers=h
    )
    assert resp.status_code == 422


async def test_notes_and_habits_and_focus_roundtrip(api_client, migrated_db, two_users):
    h = headers_for(USER["id"], USER["email"])
    create_note = await api_client.post(
        "/api/notes",
        json={"title": "Mitosis", "content_text": "Mitosis splits a eukaryotic cell into two identical daughters.", "tags": ["bio"]},
        headers=h,
    )
    assert create_note.status_code == 201, create_note.text

    searched = await api_client.get("/api/notes?q=mitosis", headers=h)
    assert any(n["title"] == "Mitosis" for n in searched.json())

    create_habit = await api_client.post(
        "/api/habits", json={"name": "Read 20m", "target_days": 5}, headers=h
    )
    assert create_habit.status_code == 201
    habit = create_habit.json()
    toggled = await api_client.post(f"/api/habits/{habit['id']}/logs", json={}, headers=h)
    assert toggled.status_code == 201, toggled.text
    assert toggled.json()["done_today"] is True

    focus = await api_client.post(
        "/api/focus/sessions", json={"kind": "focus", "duration_min": 25}, headers=h
    )
    assert focus.status_code == 201, focus.text


async def test_review_cards_updates_state_and_logs(api_client, migrated_db, two_users):
    h = headers_for(USER["id"], USER["email"])
    space = (
        await api_client.post(
            "/api/spaces", json={"title": "Biology 201"}, headers=h
        )
    ).json()

    # create a card directly through SQL via a service row (API only does
    # generation through studio — here we seed it directly as the user)
    # Use realistic FSRS initial values (after first review: stability~2.3, difficulty~2.1)
    from studyspace.db import user_conn

    async with user_conn({"sub": USER["id"], "role": "authenticated"}) as conn:
        card_id = await conn.fetchval(
            "insert into public.cards (space_id, front, back, tags) values ($1, 'ATP yield?', 'About 36-38', $2::text[]) returning id",
            space["id"],
            ["bio"],
        )
        await conn.execute(
            "insert into public.card_state (user_id, card_id, due, stability, difficulty, state, reps, lapses) "
            "values ($1, $2, now(), 2.3, 2.1, 0, 0, 0)",
            USER["id"], card_id,
        )

    card_id_str = str(card_id)

    due = await api_client.get("/api/study/due", headers=h)
    assert due.status_code == 200, due.text
    assert due.json()["due_count"] >= 1

    review = await api_client.post(
        "/api/study/review",
        json={"card_id": card_id_str, "rating": 3, "duration_ms": 8000},
        headers=h,
    )
    assert review.status_code == 200, review.text
    payload = review.json()
    assert payload["state"] in ("learning", "review", "relearning")
    assert payload["reps"] >= 1
    assert payload["interval_days"] >= 0


async def test_focus_analytics_and_plans_roundtrip(api_client, migrated_db, two_users):
    h = headers_for(USER["id"], USER["email"])
    for _ in range(2):
        r = await api_client.post(
            "/api/focus/sessions", json={"kind": "focus", "duration_min": 25, "completed": True}, headers=h
        )
        assert r.status_code == 201, r.text
    summary = await api_client.get("/api/analytics/summary", headers=h)
    assert summary.status_code == 200
    data = summary.json()
    assert data["minutes_this_week"] >= 50
    assert len(data["heatmap"]) >= 1

    # manually approve a draft plan would go through planner; just insert a task
    import asyncpg

    from studyspace.db import set_pool, user_conn

    pool = await asyncpg.create_pool(dsn=migrated_db, min_size=1, max_size=4)
    set_pool(pool)
    async with user_conn({"sub": USER["id"], "role": "authenticated"}) as conn:
        plan_id = await conn.fetchval(
            "insert into public.plans (title) values ('Week plan') returning id"
        )
        await conn.execute(
            "insert into public.plan_tasks (plan_id, title, due, duration_min, source) values ($1, 'Review ATP chapter', current_date + 1, 45, 'manual')",
            plan_id,
        )
    tasks = await api_client.get("/api/planner/tasks", headers=h)
    assert any(t["title"] == "Review ATP chapter" for t in tasks.json())
    update = await api_client.patch(
        f"/api/planner/tasks/{tasks.json()[0]['id']}", json={"status": "done"}, headers=h
    )
    assert update.status_code == 200 and update.json()["status"] == "done"
