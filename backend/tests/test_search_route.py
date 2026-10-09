"""Search: one endpoint over the real retrieval SQL, scoped like the rest.

``hybrid_search`` already powered chat, studio and evals; this pins the
direct JSON surface the MCP ``search_sources`` tool calls: real
candidates out of the real SQL (vector + full-text arms fused, lexical
rerank in the test profile), a 404 for a space the caller cannot see,
and — because it is a GET — a read-only token can use it, which is the
whole reason search is not a POST under the token scope rule.
"""

from __future__ import annotations

import uuid

import asyncpg
import pytest
from conftest import headers_for
from test_import_route import _create_space
from test_mcp_pat_auth import _auth, _issue_token

QUERY_VECTOR = [0.05] * 1536
ON_TOPIC = "Osmosis is the diffusion of water across a semipermeable membrane."
OFF_TOPIC = "The treaty of Westphalia reshaped seventeenth-century Europe."


async def _seed_chunks(dsn: str, user_id: str, space_id: str) -> None:
    """Insert a source with two chunks directly — the ingestion pipeline's
    writes, without the LLM/embedding steps around them."""
    conn = await asyncpg.connect(dsn=dsn)
    try:
        source_id = await conn.fetchval(
            "insert into public.sources (user_id, space_id, type, title, status) "
            "values ($1, $2, 'text', 'Biology notes', 'ready') returning id",
            uuid.UUID(user_id),
            uuid.UUID(space_id),
        )
        for position, (content, vector) in enumerate(
            [(ON_TOPIC, QUERY_VECTOR), (OFF_TOPIC, [0.01] * 1536)]
        ):
            # asyncpg binds what it can type; pgvector reads a text literal,
            # same as fetch_candidates builds (services/retrieval.py).
            vec_literal = "[" + ",".join(f"{float(v):.6f}" for v in vector) + "]"
            await conn.execute(
                "insert into public.chunks (user_id, source_id, space_id, content, position, page, embedding) "
                "values ($1, $2, $3, $4, $5, $6, $7::vector)",
                uuid.UUID(user_id),
                source_id,
                uuid.UUID(space_id),
                content,
                position,
                1,
                vec_literal,
            )
    finally:
        await conn.close()


@pytest.fixture()
async def seeded_space(api_client, two_users, migrated_db, monkeypatch):
    async def fake_embed(text: str) -> list[float]:
        return QUERY_VECTOR

    # The query embedding is the one external call; everything after it
    # (fusion, rerank, ordering) runs for real.
    monkeypatch.setattr("studyspace.routers.search.embed_query", fake_embed)
    alice = two_users["alice"]
    space_id = await _create_space(api_client, headers_for(alice, "alice@test.dev"))
    await _seed_chunks(migrated_db, alice, space_id)
    return {"user": alice, "dsn": migrated_db, "space_id": space_id}


async def test_search_returns_fused_candidates_from_real_sql(api_client, seeded_space):
    alice = seeded_space["user"]
    resp = await api_client.get(
        f"/api/spaces/{seeded_space['space_id']}/search",
        params={"q": "osmosis membrane"},
        headers=headers_for(alice, "alice@test.dev"),
    )
    assert resp.status_code == 200, resp.text
    results = resp.json()["results"]
    assert results, "expected at least the on-topic chunk"
    top = results[0]
    assert "Osmosis" in top["content"]
    assert top["rank"] == 1
    assert top["source_title"] == "Biology notes"
    assert isinstance(top["final_score"], float)
    # Both arms contribute, but the on-topic chunk must outrank the treaty.
    contents = [hit["content"] for hit in results]
    assert contents.index(ON_TOPIC) < contents.index(OFF_TOPIC)


async def test_a_space_you_cannot_see_is_404(api_client, seeded_space, two_users):
    resp = await api_client.get(
        f"/api/spaces/{seeded_space['space_id']}/search",
        params={"q": "osmosis"},
        headers=headers_for(two_users["bob"], "bob@test.dev"),
    )
    assert resp.status_code == 404, resp.text


async def test_a_read_only_token_can_search(api_client, seeded_space):
    """The GET-as-read decision, end to end: search is not a mutation, so
    a read-scope token reaches it under the token scope rule."""
    token = await _issue_token(seeded_space["dsn"], seeded_space["user"], ["read"])
    resp = await api_client.get(
        f"/api/spaces/{seeded_space['space_id']}/search",
        params={"q": "osmosis"},
        headers=_auth(token),
    )
    assert resp.status_code == 200, resp.text
    assert any("Osmosis" in hit["content"] for hit in resp.json()["results"])


async def test_limit_truncates_and_empty_query_is_rejected(api_client, seeded_space):
    alice = seeded_space["user"]
    h = headers_for(alice, "alice@test.dev")
    base = f"/api/spaces/{seeded_space['space_id']}/search"

    resp = await api_client.get(base, params={"q": "osmosis", "limit": 1}, headers=h)
    assert resp.status_code == 200, resp.text
    assert len(resp.json()["results"]) == 1

    resp = await api_client.get(base, params={"q": ""}, headers=h)
    assert resp.status_code == 422, resp.text
