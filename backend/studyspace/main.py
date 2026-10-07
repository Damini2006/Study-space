"""StudySpace FastAPI application."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from studyspace.config import get_settings
from studyspace.db import close_pool, init_pool
from studyspace.request_log import configure_logging, request_logging
from studyspace.routers import (
    analytics,
    chat,
    citation_audit,
    client_errors,
    demo,
    evals,
    export,
    finance,
    focus,
    habits,
    mcp_internal,
    mcp_tokens,
    me,
    meta,
    models,
    notes,
    planner,
    prompt_templates,
    rag_settings,
    sources,
    spaces,
    studio,
    study,
    vision,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
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
        expose_headers=["Retry-After", "X-Request-Id"],
    )

    @app.middleware("http")
    async def security_headers(request, call_next):
        resp = await call_next(request)
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["X-Frame-Options"] = "DENY"
        resp.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        resp.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        resp.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        resp.headers["Cache-Control"] = "no-store" if request.url.path.startswith("/api/") else resp.headers.get("Cache-Control", "no-cache")
        return resp

    # Registered last, so it is the outermost middleware: the line it writes
    # describes the response the client actually received, headers included,
    # and the full time the request spent inside the app.
    @app.middleware("http")
    async def log_requests(request, call_next):
        return await request_logging(request, call_next)

    app.include_router(meta.router, prefix="/api")
    app.include_router(me.router, prefix="/api")
    app.include_router(spaces.router, prefix="/api")
    app.include_router(sources.router, prefix="/api")
    app.include_router(export.router, prefix="/api")
    app.include_router(models.router, prefix="/api")
    app.include_router(prompt_templates.router, prefix="/api")
    app.include_router(rag_settings.router, prefix="/api")
    app.include_router(citation_audit.router, prefix="/api")
    app.include_router(chat.router, prefix="/api")
    app.include_router(client_errors.router, prefix="/api")
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
