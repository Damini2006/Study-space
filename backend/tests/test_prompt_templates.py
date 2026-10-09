"""Prompt templates: rendering, the built-in set, and the system/custom boundary.

Two properties matter most here. Rendering must happen through the *same* code
the pipeline uses — a preview that rendered differently would be lying about
what the model receives — and a template with no built-in must say "not found"
rather than crash, because the enum deliberately admits more types than there
are built-ins.
"""

from __future__ import annotations

import re

import pytest
from fastapi import HTTPException

from studyspace.models.ai_intelligence import PromptTemplateType
from studyspace.routers.prompt_templates import (
    SYSTEM_TEMPLATES,
    _hydrate,
    _render,
    _system_row,
    list_templates,
    render_template,
)

# `{{ name }}`, `{{- name -}}`: captures every placeholder a template can use.
_PLACEHOLDER = re.compile(r"\{\{-?\s*([A-Za-z_][A-Za-z0-9_]*)")

# Types the enum admits that have no built-in template behind them. `custom` is
# a storage slot, and the three layer knobs predate the template system.
_TYPES_WITHOUT_BUILT_IN = {
    t.value for t in PromptTemplateType
} - set(SYSTEM_TEMPLATES)


class FakeDb:
    """Just enough of the DB API for routes that fall through to built-ins."""

    def __init__(self, rows=None):
        self.rows = list(rows or [])

    async def fetch(self, *args, **kwargs):
        return list(self.rows)

    async def fetchrow(self, *args, **kwargs):
        return None

    async def fetchval(self, *args, **kwargs):
        return None

    async def execute(self, *args, **kwargs):
        return "DELETE 0"


class TestRendering:
    def test_substitutes_variables(self):
        assert _render("Q: {{ question }}", {"question": "why?"}) == "Q: why?"

    def test_html_is_not_escaped(self):
        """autoescape must stay off — these are prompts, not HTML.

        Escaping would hand the model literal `&lt;context&gt;` and quietly
        break grounding on a passage that uses angle brackets.
        """
        out = _render("<context>\n{{ body }}\n</context>", {"body": "a & b < c"})
        assert out == "<context>\na & b < c\n</context>"

    def test_a_missing_variable_is_a_loud_400(self):
        """StrictUndefined, not silent emptiness.

        Rendering "" would send an answer prompt with no context attached and
        the model would happily answer from nothing.
        """
        with pytest.raises(HTTPException) as excinfo:
            _render("Answer from {{ context }}", {})
        assert excinfo.value.status_code == 400
        assert "context" in excinfo.value.detail

    def test_a_syntax_error_is_a_400(self):
        with pytest.raises(HTTPException) as excinfo:
            _render("{% if broken %}", {})
        assert excinfo.value.status_code == 400
        assert "Template failed to render" in excinfo.value.detail

    @pytest.mark.parametrize("topic", [None, "", "Mitosis"])
    def test_conditional_blocks_render_both_ways(self, topic):
        tpl = "{% if topic %}Topic: {{ topic }}\n\n{% endif %}Passages: {{ passages }}"
        out = _render(tpl, {"topic": topic, "passages": "p1"})
        assert out.endswith("Passages: p1")
        assert ("Topic: Mitosis" in out) is bool(topic)


class TestBuiltInConsistency:
    """SYSTEM_TEMPLATES is maintained by hand and is the fallback for every
    answer, so its internal agreement is worth pinning down."""

    def test_every_key_is_a_valid_template_type(self):
        assert set(SYSTEM_TEMPLATES) <= {t.value for t in PromptTemplateType}

    def test_declared_variables_all_appear_in_the_template(self):
        # A variable listed but never used means callers are asked to supply
        # something that has no effect — they will tune it and see nothing move.
        for type_, info in SYSTEM_TEMPLATES.items():
            used = set(_PLACEHOLDER.findall(info["template"]))
            undeclared = used - set(info["variables"])
            assert not undeclared, f"{type_} uses undeclared {sorted(undeclared)}"

    def test_every_placeholder_is_declared(self):
        # The reverse: an undeclared placeholder renders via StrictUndefined as
        # a 400 at request time, which is the worst moment to find out.
        for type_, info in SYSTEM_TEMPLATES.items():
            used = set(_PLACEHOLDER.findall(info["template"]))
            unused = set(info["variables"]) - used
            assert not unused, f"{type_} declares unused {sorted(unused)}"

    def test_every_builtin_renders_with_its_declared_variables(self):
        """The proof that `variables` is not decorative: it is exactly what
        makes each built-in render."""
        for info in SYSTEM_TEMPLATES.values():
            values = {name: f"<{name}>" for name in info["variables"]}
            out = _render(info["template"], values)
            for value in values.values():
                assert value in out

    def test_entries_carry_a_name_and_description(self):
        for type_, info in SYSTEM_TEMPLATES.items():
            assert info["name"].strip(), type_
            assert info["description"].strip(), type_

    def test_exactly_four_types_have_no_built_in(self):
        # Documented so that adding a type without a template is a conscious
        # decision rather than a silent 500 waiting to happen.
        assert _TYPES_WITHOUT_BUILT_IN == {
            "relevance_gate",
            "citation_validation",
            "claim_verification",
            "custom",
        }


class TestSystemRow:
    def test_marks_itself_as_read_only(self):
        """`id is None` and `created_by is None` are what the UI keys off to
        disable save and delete on a built-in."""
        row = _system_row(PromptTemplateType.studio_quiz)
        assert row["is_system"] is True
        assert row["id"] is None
        assert row["space_id"] is None
        assert row["created_by"] is None
        assert row["created_at"] is None
        assert row["version"] == 1

    def test_returns_the_declared_template_and_variables(self):
        row = _system_row(PromptTemplateType.studio_quiz)
        assert row["type"] == "studio_quiz"
        assert row["template"] == SYSTEM_TEMPLATES["studio_quiz"]["template"]
        assert row["variables"] == SYSTEM_TEMPLATES["studio_quiz"]["variables"]


class TestHydrate:
    def test_variables_json_string_becomes_a_list(self):
        assert _hydrate({"variables": '["a", "b"]'})["variables"] == ["a", "b"]

    def test_variables_already_a_list_pass_through(self):
        assert _hydrate({"variables": ["a"]})["variables"] == ["a"]

    def test_null_variables_become_an_empty_list(self):
        assert _hydrate({"variables": None})["variables"] == []

    def test_unparseable_variables_become_an_empty_list(self):
        # A malformed jsonb must not raise and take the whole listing with it.
        assert _hydrate({"variables": "not json"})["variables"] == []

    @pytest.mark.parametrize(
        "bogus",
        [
            pytest.param(42, id="jsonb-number"),
            pytest.param(0, id="jsonb-zero"),
            pytest.param(True, id="jsonb-bool"),
            pytest.param({"name": "topic"}, id="jsonb-object"),
            pytest.param('"[\"a\"]"', id="double-encoded-string"),
        ],
    )
    def test_anything_that_is_not_a_list_becomes_an_empty_list(self, bogus):
        # `or []` used to let a truthy non-list (42, a dict) straight through,
        # and the client would then call `.map()` on it. Unreachable through
        # the API — the column is only ever written from list[str] — but a
        # wrong-shaped row should degrade, not crash the whole listing.
        assert _hydrate({"variables": bogus})["variables"] == []

    def test_a_custom_row_is_never_marked_system(self):
        # Forced false: only `_system_row` may claim built-in status, so a
        # stored row can't masquerade as read-only (or vice versa).
        assert _hydrate({"variables": None, "is_system": True})["is_system"] is False


class TestListing:
    async def test_no_custom_rows_offers_every_built_in(self):
        rows = await list_templates(FakeDb(), None, None)
        assert {r["type"] for r in rows} == set(SYSTEM_TEMPLATES)
        assert all(r["is_system"] for r in rows)

    async def test_a_custom_row_hides_its_built_in_twin(self):
        """Otherwise a space would see two competing system prompts."""
        custom = {"type": "chat_system", "name": "Mine", "variables": None}
        rows = await list_templates(FakeDb([custom]), None, None)
        assert [r["type"] for r in rows].count("chat_system") == 1
        assert rows[0]["name"] == "Mine"

    async def test_filtering_by_type_narrows_the_built_ins(self):
        rows = await list_templates(FakeDb(), None, "studio_summary")
        assert [r["type"] for r in rows] == ["studio_summary"]

    async def test_an_unknown_type_filter_is_a_400_listing_the_valid_ones(self):
        with pytest.raises(HTTPException) as excinfo:
            await list_templates(FakeDb(), None, "nonsense")
        assert excinfo.value.status_code == 400
        assert "nonsense" in excinfo.value.detail
        assert "chat_system" in excinfo.value.detail


class TestRenderEndpoint:
    async def test_chat_system_lands_in_the_system_slot(self):
        out = await render_template(
            FakeDb(),
            "chat_system",
            {"assistant_name": "Ada", "source_untrusted_marker": "Untrusted."},
        )
        assert out.system is not None
        assert out.user is None and out.messages == []
        assert "Ada" in out.system

    async def test_chat_user_lands_in_the_user_slot(self):
        out = await render_template(
            FakeDb(), "chat_user", {"context": "<1> passage", "question": "why?"}
        )
        assert out.user == "<context>\n<1> passage\n</context>\n\nQuestion: why?"
        assert out.system is None and out.messages == []

    async def test_every_other_type_becomes_one_user_message(self):
        out = await render_template(
            FakeDb(), "studio_summary", {"topic": None, "passages": "p1"}
        )
        assert out.system is None and out.user is None
        assert len(out.messages) == 1
        assert out.messages[0]["role"] == "user"
        assert out.messages[0]["content"].endswith("Passages:\n\np1")
        assert "Topic focus" not in out.messages[0]["content"]

    async def test_omitted_context_is_rejected_before_anything_is_sent(self):
        with pytest.raises(HTTPException) as excinfo:
            await render_template(FakeDb(), "chat_user", {"question": "why?"})
        assert excinfo.value.status_code == 400
        assert "context" in excinfo.value.detail

    async def test_a_type_with_no_built_in_is_a_404(self):
        with pytest.raises(HTTPException) as excinfo:
            await render_template(FakeDb(), "relevance_gate", {})
        assert excinfo.value.status_code == 404

    async def test_an_unknown_id_is_a_404(self):
        with pytest.raises(HTTPException) as excinfo:
            await render_template(FakeDb(), "definitely-not-a-type", {})
        assert excinfo.value.status_code == 404
