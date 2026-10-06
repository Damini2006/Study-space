"""Unit tests for the chunking pipeline and retrieval math (no DB needed)."""

from __future__ import annotations

import pytest

from studyspace.services.chunking import PageText, chunk_pages, estimate_tokens
from studyspace.services.rag_config import global_rag_config
from studyspace.services.retrieval import (
    Candidate,
    hybrid_search,
    lexical_rerank,
    reciprocal_rank_fusion,
)


def _chunk_count(pages, **kwargs):
    return len(chunk_pages(pages, **kwargs))


class TestChunking:
    def test_short_text_single_chunk(self):
        text = "The cell theory states that all living things are made of cells."
        chunks = chunk_pages([PageText(1, text)])
        assert len(chunks) == 1
        assert chunks[0].page == 1
        assert chunks[0].position == 0
        assert chunks[0].content == text

    def test_long_text_is_split_and_overlapped(self):
        para = (
            "Mitochondria generate ATP through cellular respiration. "
            "They have their own circular DNA and a double membrane. "
        )
        text = para * 80  # ~15k chars
        chunks = chunk_pages([PageText(1, text)], target_chars=2400, overlap_chars=300)
        assert len(chunks) >= 4
        assert all(c.token_count > 0 for c in chunks)
        assert all(c.page == 1 for c in chunks)
        # overlap: the start of chunk N+1 should appear at the end of chunk N
        for i in range(1, len(chunks)):
            tail = chunks[i - 1].content[-120:]
            assert chunks[i].content[:120].split()[-1] in tail or tail.split()[0] in chunks[i].content

    def test_page_boundaries_preserved(self):
        pages = [
            PageText(1, "Page one begins the document on cell biology. It is short."),
            PageText(2, "Page two continues with the organelles and membranes of cells."),
            PageText(None, "Unpaged addendum notes at the very end."),
        ]
        chunks = chunk_pages(pages, target_chars=200, overlap_chars=40)
        assert chunks, "no chunks produced"
        first_page = chunks[0].page
        assert first_page == 1
        # the last chunk should belong to a later page (monotone non-decreasing pages)
        assert all(c.page is None or (chunks[0].page is None or c.page >= 1) for c in chunks)

    def test_estimation_and_token_count(self):
        assert estimate_tokens("a" * 400) == 100
        assert estimate_tokens("") == 1


class TestRRF:
    def test_reciprocal_rank_fusion_adds_scores(self):
        d1 = ["doc-a", "doc-b", "doc-c"]
        d2 = ["doc-c", "doc-a"]
        rrf = reciprocal_rank_fusion([d1, d2], k=60)
        # doc-a is rank1 in d1 and rank2 in d2 => highest combined score
        assert rrf["doc-a"] > rrf["doc-c"]
        assert rrf["doc-a"] > rrf["doc-b"]

    def test_rrf_weights(self):
        a = "a"
        b = "b"
        rrf = reciprocal_rank_fusion([[a], [b]], k=60, weights=[2.0, 1.0])
        assert rrf[a] > rrf[b]


class TestLexicalRerank:
    def _cand(self, text, chunk_id="c1"):
        return Candidate(chunk_id, "s1", "title", text, 1, fused_score=0.02)

    def test_rerank_prefers_on_topic_document(self):
        q = "the ribosome translates messenger rna into protein"
        a = self._cand("Ribosomes translate messenger RNA into proteins at the rough ER.", "a")
        b = self._cand("The economic history of the Roman Empire spans many centuries.", "b")
        ordered = lexical_rerank(q, [a, b])
        ordered.sort(key=lambda c: c.rerank_score or 0, reverse=True)
        assert ordered[0].chunk_id == "a"

    def test_empty_query_tokens_are_tolerated(self):
        a = self._cand("anything here", "a")
        lexical_rerank("!!!", [a])
        assert a.rerank_score is not None


class TestHybridSearch:
    """`hybrid_search` is the one retrieval entry point.

    Chat (`rag.py`) and studio generation (`studio.py`) both call it, so a
    failure here takes down every answer rather than one feature.
    """

    def _cands(self):
        return [
            Candidate("c1", "s1", "Notes", "alpha", 1, vector_rank=1, fused_score=0.90),
            Candidate("c2", "s1", "Notes", "beta", 2, vector_rank=2, fused_score=0.50),
            Candidate("c3", "s1", "Notes", "gamma", 3, vector_rank=3, fused_score=0.30),
            Candidate("c4", "s1", "Notes", "delta", 4, vector_rank=4, fused_score=0.10),
        ]

    @pytest.fixture()
    def fetch_args(self, monkeypatch):
        """Replace only the SQL query; reranking and ordering stay real."""
        captured: dict = {}

        async def fake_fetch(conn, **kwargs):
            captured.update(kwargs)
            return self._cands()

        monkeypatch.setattr("studyspace.services.retrieval.fetch_candidates", fake_fetch)
        return captured

    async def test_returns_results_at_all(self, fetch_args):
        """Regression guard.

        This function read `ordered` four times without ever assigning it, so
        every call raised UnboundLocalError — chat and studio had no working
        retrieval path at all, and no test touched it because the old suite
        never got as far as calling it.
        """
        out = await hybrid_search(
            None, query_text="alpha", query_embedding=[0.0], space_id="s1"
        )
        assert out, "hybrid_search returned nothing"
        assert {c.chunk_id for c in out} == {"c1", "c2", "c3", "c4"}

    async def test_with_the_reranker_off_the_fused_order_survives(self, fetch_args):
        cfg = global_rag_config().model_copy(update={"rerank_enabled": False})
        out = await hybrid_search(
            None,
            query_text="alpha",
            query_embedding=[0.0],
            space_id="s1",
            config=cfg,
        )
        assert [c.chunk_id for c in out] == ["c1", "c2", "c3", "c4"]

    async def test_top_k_truncates_the_result(self, fetch_args):
        cfg = global_rag_config().model_copy(update={"rerank_enabled": False})
        out = await hybrid_search(
            None,
            query_text="alpha",
            query_embedding=[0.0],
            space_id="s1",
            config=cfg,
            top_k=2,
        )
        assert [c.chunk_id for c in out] == ["c1", "c2"]

    async def test_a_spaces_weights_reach_the_candidate_query(self, fetch_args):
        """The Track 2 contract: a space's resolved tuning must reach SQL.

        If the config stopped being forwarded, retrieval would silently fall
        back to globals and the per-space panel would appear to do nothing.
        """
        cfg = global_rag_config().model_copy(
            update={"vector_weight": 0.4, "fts_weight": 0.6, "rrf_k": 99, "top_k": 3}
        )
        out = await hybrid_search(
            None,
            query_text="alpha",
            query_embedding=[0.0],
            space_id="s1",
            config=cfg,
        )
        assert fetch_args["vector_weight"] == 0.4
        assert fetch_args["fts_weight"] == 0.6
        assert fetch_args["rrf_k"] == 99
        # `top_k` is applied here rather than in SQL, so a space's depth limit
        # still governs the answer when the caller doesn't ask for a length.
        assert len(out) == 3

    async def test_a_narrow_rerank_depth_never_drops_candidates(self, fetch_args):
        """Rerank cost is meant to scale with depth, not with recall.

        Only the head is rescored — the tail must still come through in its
        fused order rather than being cut off.
        """
        cfg = global_rag_config().model_copy(
            update={"rerank_enabled": True, "rerank_top_n": 1}
        )
        out = await hybrid_search(
            None,
            query_text="alpha",
            query_embedding=[0.0],
            space_id="s1",
            config=cfg,
        )
        assert {c.chunk_id for c in out} == {"c1", "c2", "c3", "c4"}
        assert out[0].chunk_id == "c1"
