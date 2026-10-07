"""The generated API reference: on in development, gone in production.

FastAPI assembles the spec lazily from the router registry main.py wires,
which makes /openapi.json two things at once — the documentation source,
and a canary for the registry itself. A commented-out include_router or a
response model that stopped serializing shows up here before anyone
notices a missing endpoint in the UI.

The production half exists because that gate is easy to lose silently:
the value it reads (Settings.env) is a deployment property no test can
observe from the outside, so the image defaults to production and these
tests pin down what the default must mean.
"""

from __future__ import annotations

from httpx import ASGITransport, AsyncClient

from studyspace.config import get_settings
from studyspace.main import create_app

# A floor, not a fingerprint: routes come and go with features (68 paths
# when this was written), but half the registry dropping out must fail
# loudly rather than ship quietly.
MIN_PATHS = 50

# One representative per area, chosen so a regression reads as a missing
# domain rather than a missing oddity: liveness, spaces CRUD, SSE chat,
# notes, telemetry ingest, MCP tokens.
CANARY_PATHS = (
    "/api/health",
    "/api/spaces",
    "/api/spaces/{space_id}/chat",
    "/api/notes",
    "/api/client-errors",
    "/api/me/mcp-tokens",
)


async def test_docs_and_spec_serve_in_development(api_client):
    docs = await api_client.get("/docs")
    assert docs.status_code == 200
    assert docs.headers["content-type"].startswith("text/html")
    assert "swagger" in docs.text.lower()

    spec_resp = await api_client.get("/openapi.json")
    assert spec_resp.status_code == 200
    spec = spec_resp.json()
    assert spec["info"]["version"] == "1.0.0"

    missing = [path for path in CANARY_PATHS if path not in spec["paths"]]
    assert not missing, f"routers missing from the spec: {missing}"
    assert len(spec["paths"]) >= MIN_PATHS


async def test_docs_and_spec_are_off_in_production(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    get_settings.cache_clear()

    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        for path in ("/docs", "/openapi.json"):
            resp = await client.get(path)
            assert resp.status_code == 404, f"{path} must not be served in production"

        # Docs gating must not cost the app its routes: liveness still
        # answers, which is also what the Docker HEALTHCHECK probes.
        health = await client.get("/api/health")
        assert health.status_code == 200
