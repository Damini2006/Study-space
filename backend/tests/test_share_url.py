"""Share URLs point at the frontend that is actually configured.

``publish_space`` and ``get_public_info`` used to hardcode
``http://localhost:5175`` - a port nothing serves, so every share link the
API handed out was dead on arrival. The origin now comes from
``CORS_ORIGINS`` (the deployment's own list of accepted frontend origins,
first entry canonical), and these tests pin that: the default config, a
changed config across both endpoints, and the empty-list fallback.
"""

from __future__ import annotations

from conftest import headers_for

from studyspace.config import get_settings


async def _create_space(api_client, h: dict) -> str:
    resp = await api_client.post("/api/spaces", json={"title": "Share Space"}, headers=h)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def test_publish_builds_the_share_url_from_the_configured_origin(
    api_client, migrated_db, two_users
):
    h = headers_for(two_users["alice"], "alice@test.dev")
    space_id = await _create_space(api_client, h)

    resp = await api_client.post(
        f"/api/spaces/{space_id}/public", json={"slug": "biology-notes"}, headers=h
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["public_url"] == "http://localhost:5173/s/biology-notes"


async def test_both_endpoints_follow_a_configured_origin_change(
    api_client, migrated_db, two_users, monkeypatch
):
    monkeypatch.setenv("CORS_ORIGINS", "https://study.example.com,https://alt.example.com")
    get_settings.cache_clear()

    h = headers_for(two_users["alice"], "alice@test.dev")
    space_id = await _create_space(api_client, h)

    published = await api_client.post(
        f"/api/spaces/{space_id}/public", json={"slug": "bio"}, headers=h
    )
    assert published.status_code == 201, published.text
    assert published.json()["public_url"] == "https://study.example.com/s/bio"

    info = await api_client.get(f"/api/spaces/{space_id}/public", headers=h)
    assert info.status_code == 200
    assert info.json()["public_url"] == "https://study.example.com/s/bio"


async def test_an_empty_origin_list_falls_back_instead_of_failing(
    api_client, migrated_db, two_users, monkeypatch
):
    monkeypatch.setenv("CORS_ORIGINS", "")
    get_settings.cache_clear()

    h = headers_for(two_users["alice"], "alice@test.dev")
    space_id = await _create_space(api_client, h)

    resp = await api_client.post(
        f"/api/spaces/{space_id}/public", json={"slug": "fallback"}, headers=h
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["public_url"] == "http://localhost:5173/s/fallback"
