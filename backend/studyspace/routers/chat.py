"""Chat endpoints — SSE streaming with citations and answer status."""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from studyspace.config import get_settings
from studyspace.db import user_conn
from studyspace.deps import DbDep, UserDep
from studyspace.models.chat import ChatHistory, ChatMessage, ChatRequest, ChatThread
from studyspace.rate_limit import rate_limit
from studyspace.services.rag import ChatContext, run_chat

router = APIRouter(prefix="/spaces/{space_id}/chat", tags=["chat"])


def _sse(event: dict[str, Any]) -> str:
    return f"data: {json.dumps(event, default=str)}\n\n"


@router.post("")
async def chat(request: Request, space_id: uuid.UUID, body: ChatRequest, user: UserDep) -> StreamingResponse:
    settings = get_settings()
    rl = await rate_limit(f"chat:{user.id}", settings.rate_limit_chat_per_min, 60)
    if not rl.allowed:
        return StreamingResponse(
            iter(
                [
                    _sse({"type": "error", "detail": "Message limit reached — wait a moment and try again."}),
                    _sse({"type": "done"}),
                ]
            ),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    ctx = ChatContext(
        user_id=user.id,
        space_id=str(space_id),
        request=body,
        conn_factory=lambda: user_conn(user.claims),
    )

    async def event_stream() -> AsyncIterator[str]:
        async for event in run_chat(ctx):
            yield _sse(event)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


@router.get("/threads", response_model=list[ChatThread])
async def list_threads(space_id: uuid.UUID, db: DbDep) -> list[ChatThread]:
    rows = await db.fetch(
        "select id, space_id, title, created_at, updated_at from public.chat_threads "
        "where space_id = $1 and user_id = auth.uid() order by updated_at desc limit 50",
        space_id,
    )
    return [
        ChatThread(id=r["id"], space_id=r["space_id"], title=r["title"],
                   created_at=r["created_at"], updated_at=r["updated_at"])
        for r in rows
    ]


@router.get("/threads/{thread_id}", response_model=ChatHistory)
async def get_thread(space_id: uuid.UUID, thread_id: uuid.UUID, db: DbDep) -> ChatHistory:
    thread = await db.fetchrow(
        "select id, space_id, title, created_at, updated_at from public.chat_threads "
        "where id = $1 and space_id = $2 and user_id = auth.uid()",
        thread_id, space_id,
    )
    if thread is None:
        raise HTTPException(status_code=404, detail="Thread not found.")
    messages = await db.fetch(
        "select m.id, m.thread_id, m.role, m.content, m.status, m.created_at "
        "from public.messages m where m.thread_id = $1 order by m.created_at",
        thread_id,
    )
    ids = [m["id"] for m in messages]
    citations = []
    if ids:
        citations = await db.fetch(
            "select c.message_id, c.chunk_id, c.label, c.quote_span, c.verified, c.score, "
            "ch.source_id, s.title as source_title, ch.page "
            "from public.citations c "
            "join public.chunks ch on ch.id = c.chunk_id "
            "join public.sources s on s.id = ch.source_id "
            "where c.message_id = any($1) order by c.label",
            ids,
        )
    claims = []
    if ids:
        claims = await db.fetch(
            "select message_id, text, supported, chunk_id, judge_score from public.claims "
            "where message_id = any($1) order by position",
            ids,
        )

    by_message: dict[str, list[dict]] = {}
    for c in citations:
        by_message.setdefault(str(c["message_id"]), []).append(
            {
                "label": c["label"], "chunk_id": c["chunk_id"], "source_id": c["source_id"],
                "source_title": c["source_title"], "page": c["page"], "quote": c["quote_span"],
                "score": c["score"], "verified": c["verified"],
            }
        )
    claims_by_message: dict[str, list[dict]] = {}
    for c in claims:
        claims_by_message.setdefault(str(c["message_id"]), []).append(
            {"text": c["text"], "supported": c["supported"],
             "chunk_id": c["chunk_id"], "judge_score": c["judge_score"]}
        )

    out = [
        ChatMessage(
            id=m["id"], thread_id=m["thread_id"], role=m["role"], content=m["content"],
            status=m["status"], citations=by_message.get(str(m["id"]), []),
            claims=claims_by_message.get(str(m["id"]), []), created_at=m["created_at"],
        )
        for m in messages
    ]
    return ChatHistory(
        thread=ChatThread(id=thread["id"], space_id=thread["space_id"], title=thread["title"],
                          created_at=thread["created_at"], updated_at=thread["updated_at"]),
        messages=out,
    )


@router.delete("/threads/{thread_id}", status_code=204)
async def delete_thread(space_id: uuid.UUID, thread_id: uuid.UUID, db: DbDep) -> None:
    result = await db.execute(
        "delete from public.chat_threads where id = $1 and space_id = $2 and user_id = auth.uid()",
        thread_id, space_id,
    )
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Thread not found.")
