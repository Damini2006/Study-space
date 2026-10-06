"""Per-space RAG configuration: the precedence rule, and proof that the
Settings panel and the answer pipeline are looking at the same baseline.

The panel reads `_defaults()` / `_respond()`; the pipeline reads
`global_rag_config()` / `resolve_rag_config()`. If those two ever disagree the
app silently runs with settings nobody can see — so most of this file is about
keeping them identical, not about the precedence arithmetic.
"""

from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import HTTPException

from studyspace.models.ai_intelligence import RagSettings, RagSettingsUpdate
from studyspace.routers.rag_settings import _respond, _validate_weights
from studyspace.services.rag_config import (
    _SELECT,
    describe,
    global_rag_config,
    layer_toggles,
    resolve_rag_config,
)

SPACE = uuid4()


class FakeConn:
    """Minimal asyncpg stand-in: `fetchrow` is all `resolve_rag_config` calls."""

    def __init__(self, row=None, error=None):
        self.row = row
        self.error = error
        self.queries = []

    async def fetchrow(self, sql, *args):
        self.queries.append((sql, args))
        if self.error is not None:
            raise self.error
        return self.row


class TestGlobalBaseline:
    """The single baseline every other view is compared against."""

    def test_every_selected_column_is_a_model_field(self):
        # The column list and the model are maintained by hand. Adding a column
        # without adding the field drops it silently: the config would read it
        # and nothing downstream would ever see it.
        columns = {c.strip() for c in _SELECT.split(",") if c.strip()}
        fields = set(RagSettings.model_fields)
        assert columns <= fields, columns - fields

    def test_matches_the_settings_panel_view(self):
        """The panel must not show a default the pipeline doesn't use."""
        cfg = global_rag_config().model_dump()
        panel = _respond(SPACE, None).resolved.model_dump()
        for key, value in cfg.items():
            assert panel[key] == value, (key, panel[key], value)

    def test_rag_settings_model_defaults_agree(self):
        # Three places used to spell out this baseline and they had drifted:
        # the model said top_k=12 and threshold=0.35 while the pipeline ran
        # 6 and 0.30. Anything building a RagSettings from defaults alone
        # reported a baseline the app never ran.
        cfg = global_rag_config()
        model = RagSettings(space_id=SPACE)
        for key in type(cfg).model_fields:
            assert getattr(model, key) == getattr(cfg, key), key

    def test_baseline_values_come_from_config_not_hardcode(self):
        # conftest pins RAG_TOP_K indirectly (it is unset, so the documented
        # default applies); assert the wiring rather than the literal so an
        # operator changing the default env var doesn't break this test.
        from studyspace.config import get_settings

        s = get_settings()
        cfg = global_rag_config()
        assert cfg.top_k == s.rag_top_k
        assert cfg.rrf_k == s.rag_rrf_k
        assert cfg.relevance_threshold == float(s.relevance_threshold)
        assert cfg.max_tokens == s.llm_max_output_tokens
        assert cfg.relevance_gate is s.layer_relevance_gate


class TestResolvePrecedence:
    """per-space override > global default."""

    async def test_no_row_falls_back_to_globals(self):
        cfg = await resolve_rag_config(FakeConn(row=None), SPACE)
        assert cfg == global_rag_config()

    async def test_row_overrides_only_the_columns_it_sets(self):
        cfg = await resolve_rag_config(FakeConn(row={"top_k": 24}), SPACE)
        assert cfg.top_k == 24
        # everything the row didn't mention still comes from the baseline
        base = global_rag_config()
        assert cfg.vector_weight == base.vector_weight
        assert cfg.relevance_threshold == base.relevance_threshold
        assert cfg.socratic_mode is base.socratic_mode

    async def test_row_can_set_every_knob(self):
        row = {
            "top_k": 20,
            "vector_weight": 0.5,
            "fts_weight": 0.5,
            "rrf_k": 40,
            "rerank_enabled": False,
            "rerank_top_n": 12,
            "relevance_gate": False,
            "relevance_threshold": 0.2,
            "citation_validation": False,
            "claim_verification": False,
            "temperature": 0.7,
            "max_tokens": 4096,
            "socratic_mode": True,
            "chat_model": "gpt-4o",
            "judge_model": "claude-3-haiku",
            "generate_model": "gpt-4o",
        }
        cfg = await resolve_rag_config(FakeConn(row=row), SPACE)
        for key, value in row.items():
            assert getattr(cfg, key) == value, key

    async def test_unrecognised_column_is_ignored(self):
        # A future column the model doesn't know about must not blow up a
        # question that is merely trying to answer.
        cfg = await resolve_rag_config(
            FakeConn(row={"top_k": 7, "brand_new_column": "x"}), SPACE
        )
        assert cfg.top_k == 7

    async def test_db_failure_degrades_to_globals_instead_of_raising(self):
        # Tuning is a preference; a failed read must never fail the answer.
        cfg = await resolve_rag_config(
            FakeConn(error=RuntimeError("connection lost")), SPACE
        )
        assert cfg == global_rag_config()

    async def test_lookup_is_one_primary_key_read(self):
        conn = FakeConn(row=None)
        await resolve_rag_config(conn, SPACE)
        assert len(conn.queries) == 1
        assert conn.queries[0][1] == (str(SPACE),)


class TestLayerToggles:
    def test_exposes_the_three_layer_flags(self):
        toggles = layer_toggles(global_rag_config())
        assert set(toggles) == {"relevance_gate", "citation_validation", "claim_verification"}
        assert all(isinstance(v, bool) for v in toggles.values())

    def test_follows_the_config_it_is_given(self):
        cfg = global_rag_config().model_copy(update={"claim_verification": False})
        assert layer_toggles(cfg)["claim_verification"] is False


class TestDescribe:
    def test_identical_config_reports_nothing(self):
        cfg = global_rag_config()
        assert describe(cfg, cfg) == {}

    def test_reports_only_what_actually_differs(self):
        cfg = global_rag_config().model_copy(update={"top_k": 99})
        assert describe(cfg, global_rag_config()) == {"top_k": 99}

    def test_defaults_to_the_global_baseline(self):
        cfg = global_rag_config().model_copy(update={"temperature": 1.5})
        assert describe(cfg) == {"temperature": 1.5}


class TestPanelProvenance:
    """The `overridden` list the Settings panel draws its badges from."""

    def test_a_fresh_space_is_entirely_default(self):
        report = _respond(SPACE, None)
        assert report.is_default is True
        assert report.overridden == []

    def test_only_genuinely_different_fields_are_flagged(self):
        report = _respond(SPACE, {"top_k": 24})
        assert report.overridden == ["top_k"]
        assert report.resolved.top_k == 24
        assert report.is_default is False

    def test_decimal_columns_do_not_read_as_overridden(self):
        """asyncpg returns `numeric` as Decimal, and Decimal("0.70") != 0.70.

        Comparing the raw row against the raw defaults reported every numeric
        column as overridden on any space that had ever saved once, so the panel
        badged vector weight, full-text weight, threshold and temperature as
        customised when all four were exactly the default.
        """
        base = global_rag_config()
        row = {
            "top_k": base.top_k,
            "vector_weight": Decimal(str(base.vector_weight)),
            "fts_weight": Decimal(str(base.fts_weight)),
            "relevance_threshold": Decimal(str(base.relevance_threshold)),
            "temperature": Decimal(str(base.temperature)),
        }
        assert _respond(SPACE, row).overridden == []

    def test_a_real_change_alongside_decimal_defaults_is_still_flagged(self):
        base = global_rag_config()
        row = {
            "top_k": base.top_k + 6,
            "vector_weight": Decimal(str(base.vector_weight)),
        }
        report = _respond(SPACE, row)
        assert report.overridden == ["top_k"]
        assert report.resolved.top_k == base.top_k + 6

    def test_rows_cannot_flag_fields_the_panel_cannot_write(self):
        # `created_at` / `updated_at` / `space_id` are bookkeeping; flagging
        # them would offer the user a control that saves nothing.
        report = _respond(SPACE, {"top_k": 5, "created_at": "2020-01-01"})
        assert report.overridden == ["top_k"]


class TestWeightValidation:
    """A zero weight silently disables a search arm, so it must never save."""

    @pytest.mark.parametrize(
        ("field", "arm", "other_arm"),
        [
            ("vector_weight", "semantic", "full-text"),
            ("fts_weight", "full-text", "semantic"),
        ],
    )
    def test_zero_is_rejected_and_names_the_right_arm(self, field, arm, other_arm):
        """The message must say what *actually* gets switched off.

        This used to pick the arm with a ternary and had the two labels swapped:
        an operator setting fts_weight to 0 was told it would disable *semantic*
        search — the opposite of what happened, which is worse than saying
        nothing.
        """
        with pytest.raises(HTTPException) as excinfo:
            _validate_weights({field: 0.0})
        assert excinfo.value.status_code == 400
        assert excinfo.value.detail.startswith(field)
        assert arm in excinfo.value.detail
        assert other_arm not in excinfo.value.detail

    @pytest.mark.parametrize("value", [0.05, 0.3, 1.0])
    def test_valid_weights_pass(self, value):
        _validate_weights({"vector_weight": value, "fts_weight": value})

    @pytest.mark.parametrize("value", [0.0, 0.01, -1.0, 1.01])
    def test_out_of_range_weights_are_rejected(self, value):
        with pytest.raises(HTTPException):
            _validate_weights({"vector_weight": value})

    def test_missing_field_passes_so_a_partial_patch_works(self):
        # A PATCH that only touches top_k must not require the weights to be present.
        _validate_weights({"top_k": 10})

    def test_a_null_weight_passes_because_it_is_not_a_change(self):
        _validate_weights({"vector_weight": None})


class TestUpdateValidation:
    """Pydantic bounds are the last line of defence before the DB CHECK."""

    def test_top_k_below_one_is_rejected(self):
        with pytest.raises(ValueError):
            RagSettingsUpdate(top_k=0)

    def test_top_k_above_fifty_is_rejected(self):
        with pytest.raises(ValueError):
            RagSettingsUpdate(top_k=51)

    def test_temperature_must_stay_in_sampling_range(self):
        with pytest.raises(ValueError):
            RagSettingsUpdate(temperature=3.0)

    def test_unset_fields_are_none_so_a_patch_never_clobbers_them(self):
        # exclude_unset is what lets a caller send only what it touched; if a
        # default ever leaked in here, saving would rewrite every column.
        update = RagSettingsUpdate(top_k=10)
        assert update.model_dump(exclude_unset=True) == {"top_k": 10}
        assert update.model_dump(exclude_unset=True, exclude_none=True) == {"top_k": 10}
