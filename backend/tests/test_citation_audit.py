"""Citation audit: the four ways an answer stops being checkable, and the order
they are reported in.

`_classify` is the whole decision. It decides what the reader is told about a
claim they may be about to rely on, so the states and their precedence are worth
pinning down: a citation whose evidence is gone is a different problem from one
that merely matched weakly, and the reader's next action differs too.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from studyspace.models.ai_intelligence import (
    CitationAuditItem,
    CitationAuditReport,
    CitationAuditStatus,
)
from studyspace.routers.citation_audit import LOW_SCORE_CUTOFF, MAX_ITEMS, _classify

NOW = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)
CHUNK = uuid4()
SOURCE = uuid4()


def classify(
    *,
    chunk_id=CHUNK,
    source_id=SOURCE,
    source_updated_at=None,
    created_at=NOW,
    score=0.75,
    verified=True,
):
    return _classify(
        chunk_id=chunk_id,
        source_id=source_id,
        source_updated_at=source_updated_at,
        created_at=created_at,
        score=score,
        verified=verified,
    )


class TestMissingEvidence:
    def test_deleted_source_is_broken(self):
        # Both the passage and the document behind it are gone: nothing to open.
        status, details = classify(chunk_id=None, source_id=None)
        assert status is CitationAuditStatus.broken
        assert "deleted" in details

    def test_deleted_passage_is_missing_chunk(self):
        # The source survived, only this passage went — different remedy.
        status, details = classify(chunk_id=None, source_id=SOURCE)
        assert status is CitationAuditStatus.missing_chunk
        assert "deleted" in details
        assert status is not CitationAuditStatus.broken


class TestStaleness:
    def test_source_edited_after_the_answer_is_stale(self):
        status, details = classify(source_updated_at=NOW + timedelta(days=1))
        assert status is CitationAuditStatus.stale
        assert "edited after" in details

    def test_source_edited_before_the_answer_is_fine(self):
        status, _ = classify(source_updated_at=NOW - timedelta(days=1))
        assert status is not CitationAuditStatus.stale

    def test_a_source_with_no_timestamp_never_reads_as_stale(self):
        status, _ = classify(source_updated_at=None)
        assert status is not CitationAuditStatus.stale

    def test_an_answer_with_no_timestamp_never_reads_as_stale(self):
        status, _ = classify(created_at=None, source_updated_at=NOW)
        assert status is not CitationAuditStatus.stale


class TestWeakEvidence:
    def test_unverified_citation_is_low_score(self):
        status, details = classify(verified=False)
        assert status is CitationAuditStatus.low_score
        assert "answer time" in details

    def test_score_below_the_cutoff_is_low_score(self):
        status, details = classify(score=LOW_SCORE_CUTOFF - 0.01)
        assert status is CitationAuditStatus.low_score
        assert f"{LOW_SCORE_CUTOFF - 0.01:.2f}" in details

    def test_score_at_the_cutoff_passes(self):
        status, _ = classify(score=LOW_SCORE_CUTOFF)
        assert status is not CitationAuditStatus.low_score

    def test_a_citation_with_no_recorded_score_is_not_docked(self):
        # score became nullable in migration 0010; "no score recorded" is not
        # the same claim as "scored badly" and must not be reported as one.
        status, _ = classify(score=None)
        assert status is not CitationAuditStatus.low_score


class TestVerified:
    def test_intact_and_unambiguous_citation_verifies(self):
        status, details = classify()
        assert status is CitationAuditStatus.verified
        assert "still exists" in details

    def test_verification_and_score_are_independent_signals(self):
        # Both must pass: `verified=False` flags a citation even when it scored
        # well, and a good score cannot rescue one that validation rejected.
        assert classify(verified=False, score=0.99)[0] is CitationAuditStatus.low_score
        assert classify(verified=True, score=0.99)[0] is CitationAuditStatus.verified
        assert classify(verified=True, score=0.05)[0] is CitationAuditStatus.low_score


class TestPrecedence:
    """Order matters: the worst condition wins, and must be reported first."""

    def test_gone_evidence_beats_staleness(self):
        # The source was edited after the answer AND the passage is deleted.
        # "you cannot open it at all" is the actionable fact.
        status, _ = classify(
            chunk_id=None, source_id=SOURCE, source_updated_at=NOW + timedelta(days=1)
        )
        assert status is CitationAuditStatus.missing_chunk

    def test_gone_evidence_beats_weakness(self):
        status, _ = classify(chunk_id=None, source_id=SOURCE, verified=False, score=0.01)
        assert status is CitationAuditStatus.missing_chunk

    def test_staleness_beats_weakness(self):
        status, _ = classify(
            source_updated_at=NOW + timedelta(days=1), verified=False, score=0.01
        )
        assert status is CitationAuditStatus.stale

    def test_unverified_beats_a_passing_score(self):
        # A citation that validation did not confirm is flagged even though its
        # retrieval score was fine — the two signals disagree and the cautious
        # one wins.
        status, _ = classify(verified=False, score=0.99)
        assert status is CitationAuditStatus.low_score

    def test_every_path_returns_human_explanation(self):
        cases = [
            {},
            {"chunk_id": None, "source_id": None},
            {"chunk_id": None},
            {"source_updated_at": NOW + timedelta(days=1)},
            {"verified": False},
            {"score": 0.01},
        ]
        for kwargs in cases:
            _, details = classify(**kwargs)
            assert isinstance(details, str) and details.strip()
            assert details.endswith(".")


class TestReportModels:
    def test_every_status_is_representable(self):
        # A status added to the enum without a branch in `_classify` would be
        # unreachable at runtime; this documents the full set the UI must style.
        assert {s.value for s in CitationAuditStatus} == {
            "verified",
            "missing_chunk",
            "stale",
            "broken",
            "low_score",
        }

    def test_item_accepts_the_nullable_fields_the_migration_made_nullable(self):
        # chunk_id/source_id/score going null is exactly the state the audit
        # exists to report; if the model rejected them, deleted evidence could
        # not be described at all.
        item = CitationAuditItem(
            citation_id=uuid4(),
            message_id=uuid4(),
            chunk_id=None,
            source_id=None,
            source_title="(deleted source)",
            label=1,
            quote="",
            score=None,
            verified=False,
            status=CitationAuditStatus.broken,
            details="gone",
            created_at=NOW,
        )
        assert item.chunk_id is None and item.source_id is None and item.score is None

    def test_omitted_title_still_yields_a_renderable_one(self):
        # The router always passes a title, but if the snapshot is missing the
        # model must not hand the UI `None` to render where a filename goes.
        item = CitationAuditItem(
            citation_id=uuid4(),
            message_id=uuid4(),
            label=1,
            status=CitationAuditStatus.broken,
            details="gone",
            created_at=NOW,
        )
        assert item.source_title == "(deleted source)"

    def test_report_is_not_claimed_complete_when_it_is_truncated(self):
        # Without this flag a capped report looks identical to a clean one, and
        # the reader would conclude "no other problems" from silence.
        report = CitationAuditReport(
            space_id=uuid4(),
            total_citations=MAX_ITEMS,
            verified=MAX_ITEMS,
            issues=0,
            truncated=True,
            items=[],
            generated_at=NOW,
        )
        assert report.truncated is True

    def test_truncated_defaults_to_false(self):
        report = CitationAuditReport(
            space_id=uuid4(),
            total_citations=0,
            verified=0,
            issues=0,
            items=[],
            generated_at=NOW,
        )
        assert report.truncated is False
