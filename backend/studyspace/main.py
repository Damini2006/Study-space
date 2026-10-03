"""StudySpace FastAPI application."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from studyspace.config import get_settings
from studyspace.db import close_pool, init_pool
from studyspace.routers import (
    analytics,
    chat,
    demo,
    evals,
    finance,
    focus,
    habits,
    me,
    mcp_internal,
    mcp_tokens,
    meta,
    notes,
    planner,
    sources,
    spaces,
    study,
    studio,
    vision,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    from studyspace.tracing import flush

    try:
        yield
    finally:
        await close_pool()
        flush()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version="1.0.0",
        description="StudySpace — source-grounded AI study workspace",
        lifespan=lifespan,
        docs_url="/docs" if settings.env != "production" else None,
        redoc_url=None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origin_list),
        allow_credentials=False,  # auth is via bearer tokens, not cookies
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Accept"],
        expose_headers=["Retry-After"],
    )

    app.include_router(meta.router, prefix="/api")
    app.include_router(me.router, prefix="/api")
    app.include_router(spaces.router, prefix="/api")
    app.include_router(sources.router, prefix="/api")
    app.include_router(chat.router, prefix="/api")
    app.include_router(studio.router, prefix="/api")
    app.include_router(study.router, prefix="/api")
    app.include_router(planner.router, prefix="/api")
    app.include_router(notes.router, prefix="/api")
    app.include_router(focus.router, prefix="/api")
    app.include_router(habits.router, prefix="/api")
    app.include_router(vision.router, prefix="/api")
    app.include_router(finance.router, prefix="/api")
    app.include_router(analytics.router, prefix="/api")
    app.include_router(evals.router, prefix="/api")
    app.include_router(demo.router, prefix="/api")
    app.include_router(mcp_internal.router, prefix="/api")
    app.include_router(mcp_tokens.router, prefix="/api")
    return app


app = create_app()
