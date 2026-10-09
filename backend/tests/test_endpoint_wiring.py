"""The route table and its callers, checked against each other.

A route nobody can call is dead surface: it ships in the image, it has to be
secured, it shows up in /openapi.json, and nothing exercises it — Track 18
retired fifteen of them. Track 17 pinned the frontend half of this contract
(every api-services method has a caller); this file pins both directions
across every caller that lives in this repo:

- every route the app serves is called from somewhere in the repo, or is
  named in ALLOWLISTED_ROUTES with a written reason;
- every path a caller builds resolves to a route the app actually serves,
  so no caller can point at an endpoint that does not exist.

Callers are parsed from source rather than listed by hand, so a new call
site or a new route is picked up automatically and a mismatch fails loudly
until the two sides agree again.
"""

from __future__ import annotations

import re
from pathlib import Path

from studyspace.main import create_app

REPO_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_SRC = REPO_ROOT / "frontend" / "src"
MCP_MAIN = REPO_ROOT / "backend" / "studyspace" / "mcp_app.py"

# Infrastructure endpoints with no in-repo caller by design: the container
# HEALTHCHECK and external uptime probes reach these; nothing in the app does.
# Every other route must earn its entry in the served set from a real call.
ALLOWLISTED_ROUTES = {
    ("GET", "/api/health"),
    ("GET", "/api/health/ready"),
}

# First-argument method -> HTTP method for frontend calls. `upload` and
# `download` are api.js helpers wrapping POST-with-form-data and GET-to-disk.
_JS_METHODS = {
    "get": "GET",
    "post": "POST",
    "patch": "PATCH",
    "delete": "DELETE",
    "upload": "POST",
    "download": "GET",
}


def _normalize(path: str) -> str:
    """Reduce both sides to one shape: no host, no query, every param `{}`."""
    path = path.replace("{BACKEND_URL}", "")
    # A query string never belongs to the path — it is written plainly
    # (`?fmt=anki`) or built by a ternary interpolation
    # (``/prompt-templates${qs ? `?${qs}` : ""}``), in which case the whole
    # interpolation goes: cut at whichever of `?` / `${...?...}` comes first.
    # Plain `find` would trip on the `?` inside `opts?.flag`.
    plain = path.find("?")
    ternary = re.search(r"\$\{[^}]*\?", path)
    cuts = [i for i in (plain if plain != -1 else None, ternary.start() if ternary else None) if i is not None]
    path = path[: min(cuts)] if cuts else path
    # A `${...}` that abuts text rather than a path segment carries a query
    # (`${q}` where q is "" or "?space=x") — it contributes nothing to the
    # path. Real parameters always follow a `/`, so only those become `{}`.
    path = re.sub(r"(?<!/)\$\{[^}]*\}", "", path)
    path = re.sub(r"\$\{[^}]*\}", "{}", path)
    path = re.sub(r"\{[^{}]*\}", "{}", path)
    return path


def _with_api_prefix(path: str) -> str:
    # The frontend and MCP build paths against an API base that ends in /api;
    # the route table carries the /api itself (main.py include_router prefix).
    return path if path.startswith("/api") else f"/api{path}"


def _route(method: str, path: str) -> tuple[str, str]:
    return (method, _with_api_prefix(_normalize(path)))


def _served_routes() -> set[tuple[str, str]]:
    """The (method, path) table from the app's own OpenAPI schema.

    `app.routes` would be the other way in, but FastAPI 0.141 wraps each
    included router in a lazy `_IncludedRouter` — no APIRoute objects sit at
    the top level. The schema is the app's account of what it serves, it
    lists exactly the real methods (no HEAD/OPTIONS), and nothing in this
    codebase hides a route from it (`include_in_schema=False` appears
    nowhere), so it is the complete table.
    """
    served: set[tuple[str, str]] = set()
    for path, methods in create_app().openapi()["paths"].items():
        for method in methods:
            if method in {"get", "post", "put", "patch", "delete"}:
                served.add(_route(method.upper(), path))
    return served


def _frontend_calls() -> set[tuple[str, str]]:
    calls: set[tuple[str, str]] = set()
    for path in sorted(FRONTEND_SRC.rglob("*.js*")):
        if ".test." in path.name or ".spec." in path.name:
            continue
        text = path.read_text(encoding="utf-8")
        # api.get(`/spaces/${id}`) and friends — the api-services surface.
        for m in re.finditer(
            r"api\.(get|post|patch|delete|upload|download)\(\s*([`'\"])(.*?)\2", text, re.S
        ):
            calls.add(_route(_JS_METHODS[m.group(1)], m.group(3)))
        # fetch(`${api.base}/vitals`, { method: "POST", ... }) — the raw
        # telemetry beacons that never go through api-services.
        for m in re.finditer(r"fetch\(\s*`\$\{api\.base\}([^`]+)`(.{0,300})", text, re.S):
            method = re.search(r"method:\s*[\"'](\w+)[\"']", m.group(2))
            assert method, f"{path}: fetch to api.base without a method within 300 chars"
            calls.add(_route(_JS_METHODS[method.group(1).lower()], m.group(1)))
    return calls


def _mcp_calls() -> set[tuple[str, str]]:
    text = MCP_MAIN.read_text(encoding="utf-8")
    calls: set[tuple[str, str]] = set()
    for m in re.finditer(r"client\.(get|post|patch|delete)\(\s*f?[\"']([^\"']+)[\"']", text):
        calls.add(_route(m.group(1).upper(), m.group(2)))
    return calls


def test_every_route_has_a_caller_in_this_repo() -> None:
    orphans = _served_routes() - _frontend_calls() - _mcp_calls() - ALLOWLISTED_ROUTES
    assert not orphans, f"routes nothing in the repo calls: {sorted(orphans)}"


def test_every_in_repo_call_resolves_to_a_served_route() -> None:
    phantoms = (_frontend_calls() | _mcp_calls()) - _served_routes()
    assert not phantoms, f"calls to routes the app does not serve: {sorted(phantoms)}"


def test_the_allowlist_covers_only_routes_that_exist() -> None:
    stale = ALLOWLISTED_ROUTES - _served_routes()
    assert not stale, f"allowlist entries with no route behind them: {sorted(stale)}"
