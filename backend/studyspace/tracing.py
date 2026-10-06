"""Langfuse tracing helpers.

Every chat run, ingestion job and planner run is traced so the Admin/Evals
page can link straight to a trace. When Langfuse is not configured the
helpers degrade to no-ops that still return a correlation id, so the rest of
the code base never needs to branch on configuration.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any

from studyspace.config import get_settings

_client: Any = None
_client_initialised = False


def _get_client() -> Any:
    global _client, _client_initialised
    settings = get_settings()
    if not settings.langfuse_enabled:
        return None
    if not _client_initialised:
        _client_initialised = True
        if settings.langfuse_public_key and settings.langfuse_secret_key:
            try:
                from langfuse import get_client

                _client = get_client(
                    public_key=settings.langfuse_public_key,
                    secret_key=settings.langfuse_secret_key,
                    host=settings.langfuse_host,
                )
            except Exception:  # pragma: no cover - misconfigured env must not crash
                _client = None
    return _client


def is_enabled() -> bool:
    return _get_client() is not None


def new_trace_id() -> str:
    """Local correlation id stored on messages even without Langfuse."""
    return str(uuid.uuid4())


@dataclass
class SpanHandle:
    """Uniform handle over a Langfuse span (or a no-op stand-in)."""

    trace_id: str
    span: Any = None
    output: Any = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def set_output(self, output: Any) -> None:
        self.output = output
        if self.span is not None:
            try:
                self.span.update(output=output)
            except Exception:  # pragma: no cover
                pass

    def set_metadata(self, **metadata: Any) -> None:
        self.metadata.update(metadata)
        if self.span is not None:
            try:
                self.span.update(metadata=metadata)
            except Exception:  # pragma: no cover
                pass

    def event(self, name: str, **metadata: Any) -> None:
        if self.span is not None:
            try:
                self.span.event(name=name, metadata=metadata)
            except Exception:  # pragma: no cover
                pass


@contextmanager
def span(
    name: str,
    *,
    input: Any = None,
    user_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> Iterator[SpanHandle]:
    """Context manager around a traced operation."""
    client = _get_client()
    if client is None:
        handle = SpanHandle(trace_id=new_trace_id())
        if metadata:
            handle.metadata.update(metadata)
        yield handle
        return

    try:
        with client.start_as_current_span(name=name, input=input) as lf_span:
            if user_id or metadata:
                try:
                    client.update_current_trace(user_id=user_id, metadata=metadata or None)
                except Exception:  # pragma: no cover
                    pass
                handle = SpanHandle(trace_id=getattr(lf_span, "trace_id", new_trace_id()), span=lf_span)
            else:
                handle = SpanHandle(trace_id=getattr(lf_span, "trace_id", new_trace_id()), span=lf_span)
            yield handle
            if handle.output is not None:
                try:
                    lf_span.update(output=handle.output)
                except Exception:  # pragma: no cover
                    pass
    except Exception:  # pragma: no cover - tracing must never break a request
        handle = SpanHandle(trace_id=new_trace_id())
        yield handle


def flush() -> None:
    """Flush pending events (called on shutdown)."""
    if _client is not None:
        try:
            _client.flush()
        except Exception:  # pragma: no cover
            pass


__all__ = ["SpanHandle", "flush", "is_enabled", "new_trace_id", "span"]
