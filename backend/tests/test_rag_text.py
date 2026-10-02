"""Unit tests for the RAG text machinery: claims splitting, citation parsing,
invalid-citation stripping, factual-claim heuristic, quote-span matching."""

from __future__ import annotations

from studyspace.services.rag import (
    annotate_sentences,
    find_quote_span,
    looks_factual,
    split_sentences,
    strip_invalid_citations,
)


class TestSplitSentences:
    def test_basic_split(self):
        out = split_sentences("The cell splits into two. Each cell carries identical DNA. Bonds form.")
        assert len(out) == 3
        assert out[0].startswith("The cell splits")

    def test_numbered_lists_do_not_fragment(self):
        out = split_sentences("Step 1. Mitosis starts with prophase. Then metaphase follows.")
        assert any("Mitosis starts" in o for o in out)
        # "Step 1." should merge with the following fragment, not stand alone
        assert all(len(o) >= 3 for o in out)

    def test_multiline_bullets(self):
        out = split_sentences("First point about DNA repair.\n- Second bullet about cell walls.")
        assert len(out) == 2


class TestCitationAnnotations:
    def test_labels_extracted(self):
        sents = annotate_sentences("The Calvin cycle produces G3P [2]. Chloroplasts use light [1][3].")
        assert sents[0].labels == [2]
        assert sents[1].labels == [1, 3]
        assert sents[0].text == "The Calvin cycle produces G3P ." or sents[0].text.endswith("G3P.")

    def test_strip_invalid_citations(self):
        text, removed = strip_invalid_citations("ATP [1] is used [9], then ADP [3][12].", {1, 2, 3})
        assert removed == [9, 12]
        assert "[1]" in text and "[3]" in text
        assert "[9]" not in text and "[12]" not in text


class TestFactualHeuristic:
    def test_transition_is_not_factual(self):
        class S:
            text = "In summary, we have covered the main topics well today"

        assert looks_factual(S()) is False

    def test_question_is_not_factual(self):
        class S:
            text = "Would you like me to explain what happens to ADP then"

        assert looks_factual(S()) is False

    def test_sentence_needs_citations(self):
        class S:
            text = "The mitochondria of a eukaryotic cell are typically 0.5-1.0 micrometres wide"

        assert looks_factual(S()) is True


class TestQuoteSpan:
    CHUNK = (
        "Photosynthesis happens in two stages. The light-dependent reactions run "
        "in the thylakoid membranes and split water. The Calvin cycle operates in "
        "the stroma and fixes carbon dioxide into G3P. RuBisCO catalyses the first "
        "major step of carbon fixation during this stage of the cycle itself."
    )

    def test_matching_span_is_found(self):
        span = find_quote_span(
            ["The Calvin cycle operates in the stroma and fixes carbon dioxide"],
            self.CHUNK,
        )
        assert span is not None
        assert "Calvin cycle" in span

    def test_fallback_excerpt_when_no_match(self):
        span = find_quote_span(["Quantum computing uses superconducting qubits"], self.CHUNK)
        assert span is not None and len(span) <= 300
