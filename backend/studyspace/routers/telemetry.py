"""Client-side error reports: what the browser saw, scrubbed, one line each.

Anonymous by design. The most valuable report comes from a session that
is already broken — authentication included — so requiring a token would
discard exactly the errors worth having. That is also why nothing
identifying may depend on the caller: every field is scrubbed of
credential-shaped text and capped before it reaches a log line, holding
this endpoint to the standard the request log holds itself to — no
query strings, no tokens, one line per record.
"""

from __future__ import annotations

import logging
import re

from fastapi import APIRouter, HTTPException, Request, status

from studyspace.config import get_settings
from studyspace.models.observability import ClientErrorIn
from studyspace.rate_limit import rate_limit
from studyspace.request_log import logfmt

router = APIRouter(tags=["observability"])
logger = logging.getLogger("studyspace.client")

# Soft caps, applied here: plausible reports are truncated to these, never
# rejected. The model's larger caps are the reject-the-absurd outer ring.
_MESSAGE_CAP = 500
_STACK_CAP = 4000
_ROUTE_CAP = 200

# A JWT's three base64url segments always start with eyJ (the base64 of
# {"). The literal-dot pattern is deliberately strict: over-redacting a
# dotted URL is a cosmetic problem, under-redacting a token is not.
_JWT = re.compile(r"eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*")
_BEARER = re.compile(r"(?i)bearer\s+[A-Za-z0-9._~+/=-]+")


def scrub(text: str) -> str:
    """Remove credential-shaped substrings, then flatten to one line.

    Client messages can quote anything, including a token that was in a
    request when it failed — and a stack trace is inherently multi-line
    while a log line is inherently not. Scrub before truncating: slicing
    first would split a token and leave the first half behind.
    """
    text = _JWT.sub("[redacted-jwt]", text)
    text = _BEARER.sub("Bearer [redacted]", text)
    return re.sub(r"\s+", " ", text).strip()


@router.post("/client-errors", status_code=status.HTTP_204_NO_CONTENT)
async def receive_client_error(request: Request, report: ClientErrorIn) -> None:
    settings = get_settings()
    client = request.client.host if request.client else "unknown"
    rl = await rate_limit(
        f"client-errors:{client}", settings.rate_limit_client_errors_per_min, 60
    )
    if not rl.allowed:
        # Behind a proxy this is per-proxy rather than per-visitor, which
        # is coarse — but the limit exists to stop a flood from writing
        # logs, not to be fair to anyone.
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many error reports — wait a moment.",
            headers={"Retry-After": str(rl.retry_after)},
        )

    logger.error(
        logfmt(
            source=report.source,
            route=scrub(report.route or "")[:_ROUTE_CAP] or "-",
            message=scrub(report.message)[:_MESSAGE_CAP] or "-",
            stack=scrub(report.stack or "")[:_STACK_CAP] or "-",
            request_id=getattr(request.state, "request_id", "-"),
        )
    )
