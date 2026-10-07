"""One structured line per request, correlated from client to log.

The request id is minted here, echoed on the response, and written into
every record this request produces, so an id a user can read off an
error screen is the id an operator greps for. An inbound X-Request-Id is
honoured only when it looks like one — 8–64 of ``[A-Za-z0-9._-]`` —
because the header is user input and this value is about to be written
to logs.

Query strings are never logged. The path is ours; the query string is
where other people's tokens end up.

Format is ``key=value`` on a single line: greppable, and splittable
without a log pipeline. The level follows the response status — 2xx/3xx
INFO, 4xx WARNING, 5xx ERROR — so a quiet day stays quiet and a bad day
sorts itself out when someone asks for WARNING and above.
"""

from __future__ import annotations

import logging
import re
import time
import uuid
from collections.abc import Awaitable, Callable
from typing import Any

from starlette.requests import Request
from starlette.responses import Response

from studyspace.config import get_settings

logger = logging.getLogger("studyspace.request")

_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{8,64}$")


def new_request_id() -> str:
    return uuid.uuid4().hex


def _quote(text: str) -> str:
    escaped = text.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def logfmt(**fields: Any) -> str:
    """``key=value`` pairs on one line; values with whitespace or quotes are quoted."""
    parts = []
    for key, value in fields.items():
        text = str(value)
        if any(char.isspace() for char in text) or '"' in text:
            text = _quote(text)
        parts.append(f"{key}={text}")
    return " ".join(parts)


def configure_logging() -> None:
    """Attach a root handler at the configured level, unless the host already has one.

    uvicorn gives its own loggers handlers and leaves the root logger
    alone, so INFO records written by application code would otherwise
    have nowhere to go. When the host process has already configured
    logging — pytest, a container runtime — it knows better and is left
    untouched: capturing beats formatting.
    """
    root = logging.getLogger()
    if root.handlers:
        return
    handler = logging.StreamHandler()
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)-7s %(name)s %(message)s", datefmt="%H:%M:%S")
    )
    root.addHandler(handler)
    root.setLevel(get_settings().log_level)


def _record_level(status: int) -> int:
    if status >= 500:
        return logging.ERROR
    if status >= 400:
        return logging.WARNING
    return logging.INFO


def _emit(
    request: Request, request_id: str, status: int, started: float, **extra: Any
) -> None:
    duration_ms = (time.perf_counter() - started) * 1000
    logger.log(
        _record_level(status),
        logfmt(
            method=request.method,
            path=request.url.path,
            status=status,
            duration_ms=f"{duration_ms:.1f}",
            request_id=request_id,
            **extra,
        ),
    )


async def request_logging(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    """Write the request's line and stamp its id on the response."""
    inbound = request.headers.get("X-Request-Id", "")
    request_id = inbound if _REQUEST_ID.fullmatch(inbound) else new_request_id()
    request.state.request_id = request_id
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception as exc:
        # Starlette's error middleware sits outside this one and will turn
        # the exception into a response, but the request still deserves its
        # line — with enough in it to find the traceback printed next to it.
        _emit(request, request_id, 500, started, exception=type(exc).__name__)
        raise
    response.headers["X-Request-Id"] = request_id
    _emit(request, request_id, response.status_code, started)
    return response
