"""The golden dataset: it lives inside the package, it adds up, it is served.

The first three tests are unit tests and run on every machine — the file's
arithmetic is the product (the README and the dataset's own description
both promise 100 questions split 50/50, and duplicate ids would silently
collapse results). The last test goes through the dependency stack and
therefore needs the integration database like every other route test.
"""

from __future__ import annotations

from conftest import headers_for

from studyspace.services.eval_dataset import dataset_path, load_dataset

ALICE = {"id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "email": "alice@test.dev"}
BOB = {"id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "email": "bob@test.dev"}


def test_dataset_path_points_inside_the_package():
    path = dataset_path()
    assert path.is_file(), f"{path} is missing — every image copies the package, not the checkout"
    # layout-derived asserts, true in a checkout and in an installed image:
    assert path.name == "golden_dataset.json"
    assert path.parent.name == "data"
    assert path.parent.parent.name == "studyspace"


def test_dataset_adds_up():
    doc = load_dataset()
    questions = doc["questions"]
    ids = [q["id"] for q in questions]

    assert len(questions) == 100, "README and the dataset description both promise 100"
    assert len(set(ids)) == len(ids), "duplicate question ids collapse eval results"
    assert doc["version"] == "v1"

    kinds = [q["kind"] for q in questions]
    assert kinds.count("answerable") == 50
    assert kinds.count("unanswerable") == 50


def test_every_question_carries_its_contract():
    for q in load_dataset()["questions"]:
        assert q["kind"] in {"answerable", "unanswerable"}
        assert q["question"].strip(), q["id"]
        # Both kinds carry a reference: answerable get the gold answer,
        # unanswerable the expectation of absence the runner scores against.
        assert isinstance(q.get("reference"), str) and q["reference"].strip(), q["id"]


async def test_dataset_route_is_served_to_admins_only(api_client, migrated_db, two_users, monkeypatch):
    from studyspace.config import get_settings

    monkeypatch.setenv("ADMIN_EMAILS", "alice@test.dev")
    get_settings.cache_clear()

    anonymous = await api_client.get("/api/evals/dataset")
    assert anonymous.status_code == 401

    denied = await api_client.get("/api/evals/dataset", headers=headers_for(BOB["id"], BOB["email"]))
    assert denied.status_code == 403

    resp = await api_client.get("/api/evals/dataset", headers=headers_for(ALICE["id"], ALICE["email"]))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["exists"] is True
    assert body["version"] == "v1"
    assert body["count"] == 100
    assert body["answerable"] == 50
    assert body["unanswerable"] == 50
    assert len(body["configs"]) == 4
    assert body["configs"][0]["name"] == "baseline"
