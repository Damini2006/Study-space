"""verify_claims — the layer-3 contract chat and the eval runner share.

These branches existed only inside run_chat before, untested: the claim
layer is the anti-hallucination layer, so its three outcomes (trim,
decline, demote) are pinned here directly. The judge is the only mocked
piece; sentence annotation, looks_factual and the layer resolution are
the real ones.
"""

from __future__ import annotations

import pytest

from studyspace.models.chat import LayerToggles
from studyspace.services import rag
from studyspace.services.rag import (
    Candidate,
    ClaimVerdict,
    not_found_message,
    resolve_layers,
    verify_claims,
)


def _candidates() -> list[Candidate]:
    return [
        Candidate(
            chunk_id="c1",
            source_id="s1",
            source_title="Biology notes",
            content="Mitochondria make ATP through cellular respiration.",
            page=3,
        )
    ]


def _layers(**toggles: bool):
    return resolve_layers(LayerToggles(**toggles), None)


def _judge(supported: bool, score: float = 0.9):
    async def fake_judge(question, claims, evidence, config):
        return {
            i: ClaimVerdict(index=i, supported=supported, score=score)
            for i in range(len(claims))
        }

    return fake_judge


async def test_supported_citations_pass_verified(monkeypatch):
    monkeypatch.setattr(rag, "judge_claims", _judge(supported=True))
    layers = _layers(relevance_gate=True, citation_validation=True, claim_verification=True)

    answer, status, records = await verify_claims(
        "What do mitochondria do?", "Mitochondria make ATP [1].", "verified", _candidates(), layers
    )

    assert status == "verified"
    assert answer == "Mitochondria make ATP [1]."  # untouched
    assert records and all(r["supported"] for r in records)
    assert records[0]["chunk_id"] == "c1"


async def test_unsupported_citation_trims_answer_to_what_survives(monkeypatch):
    monkeypatch.setattr(rag, "judge_claims", _judge(supported=False))
    layers = _layers(claim_verification=True)

    answer, status, records = await verify_claims(
        "q",
        "Mitochondria make ATP [1]. That is the gist.",
        "verified",
        _candidates(),
        layers,
    )

    # the cited claim failed the judge; the non-factual tail is kept
    assert status == "low_confidence"
    assert answer == "That is the gist."
    assert records[0]["supported"] is False


async def test_everything_unsupported_falls_back_to_the_decline(monkeypatch):
    monkeypatch.setattr(rag, "judge_claims", _judge(supported=False))
    layers = _layers(claim_verification=True)

    answer, status, records = await verify_claims(
        "q", "Mitochondria make ATP [1].", "verified", _candidates(), layers
    )

    assert status == "not_found"
    assert answer == not_found_message()
    assert records and not records[0]["supported"]


async def test_claim_off_without_a_real_citation_demotes_the_badge():
    layers = _layers(citation_validation=True, claim_verification=False)

    answer, status, records = await verify_claims(
        "q", "A plain uncited answer.", "verified", _candidates(), layers
    )

    assert status == "low_confidence"  # "Verified" requires a real citation
    assert answer == "A plain uncited answer."
    assert records == []


async def test_claim_off_with_a_citation_stays_verified():
    layers = _layers(citation_validation=True, claim_verification=False)

    _answer, status, records = await verify_claims(
        "q", "Mitochondria make ATP [1].", "verified", _candidates(), layers
    )

    assert status == "verified"
    assert records == []


async def test_baseline_leaves_the_answer_completely_alone():
    # every toggle explicit: None would inherit the global config, whose
    # layers are ON by default — the opposite of a baseline run
    layers = _layers(
        relevance_gate=False, citation_validation=False, claim_verification=False
    )

    answer, status, records = await verify_claims(
        "q", "Mitochondria make ATP [1].", "verified", _candidates(), layers
    )

    assert (answer, status, records) == ("Mitochondria make ATP [1].", "verified", [])


async def test_an_existing_not_found_passes_through_untouched(monkeypatch):
    # the judge must not be consulted for a declined answer
    async def explode(*args, **kwargs):
        raise AssertionError("judge called for a not_found answer")

    monkeypatch.setattr(rag, "judge_claims", explode)
    layers = _layers(claim_verification=True, citation_validation=True)
    canned = not_found_message()

    answer, status, records = await verify_claims(
        "q", canned, "not_found", _candidates(), layers
    )

    assert (answer, status, records) == (canned, "not_found", [])


def test_extraction_matches_run_chat_signature():
    import inspect

    from studyspace.services.rag import run_chat

    # run_chat yields events; verify_claims is awaited with the same
    # request message, answer, status, candidates, layers and config.
    source = inspect.getsource(run_chat)
    assert "await verify_claims(" in source
    assert inspect.iscoroutinefunction(verify_claims)
    with pytest.raises(TypeError, match="positional"):  # keyword-friendly API
        verify_claims("q", "a", "verified")  # type: ignore[misc]
