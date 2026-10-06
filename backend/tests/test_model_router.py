"""Model routing: the catalog, per-task resolution, and the fallback chain.

The Settings panel reads these helpers and tells the operator "answering with
GPT-4o, falling back to ...". Every claim it makes has to be derived from live
configuration rather than a wish list, and the fallback chain in particular must
never suggest something that cannot do the task it is falling back *from*.
"""

from __future__ import annotations

from studyspace.config import get_settings
from studyspace.models.ai_intelligence import ModelRouterConfig, ModelTask
from studyspace.routers.models import (
    MODEL_CATALOG,
    _entry_for,
    _fallback_chain,
    _task_models,
    get_router_config,
    get_task_defaults,
    list_models,
)

# Keys `list_models` reads off every catalog row. A new row missing one blows up
# the endpoint instead of showing a blank cell.
_ENTRY_KEYS = {
    "provider",
    "model_id",
    "display_name",
    "max_tokens",
    "cost_per_1k_input",
    "cost_per_1k_output",
    "latency_class",
    "capabilities",
}


def _use(monkeypatch, **env: str) -> None:
    """Point the deployment at different models for one test.

    `monkeypatch` reverts the environment afterwards, and conftest clears the
    settings cache on teardown, so nothing leaks into the next test.
    """
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    get_settings.cache_clear()


def _every_entry(payload: dict) -> list[dict]:
    return [entry for group in payload["models"].values() for entry in group]


class TestCatalogEntry:
    def test_known_model_carries_its_catalog_metadata(self):
        entry = _entry_for("gpt-4o")
        assert entry["known"] is True
        assert entry["provider"] == "openai"
        assert entry["display_name"] == "GPT-4o"
        assert entry["cost_per_1k_input"] == 0.0025
        assert "vision" in entry["capabilities"]

    def test_undocumented_model_is_reported_rather_than_hidden(self):
        """A model LiteLLM can address but we have no price for still works.

        It has to appear in the panel — omitting it would leave the operator
        unable to see what is actually answering — but with honest unknowns.
        """
        entry = _entry_for("acme/experimental-llm")
        assert entry["known"] is False
        assert entry["provider"] == "acme"
        assert entry["display_name"] == "experimental-llm"
        assert entry["cost_per_1k_input"] is None
        assert entry["cost_per_1k_output"] is None
        assert entry["max_tokens"] is None
        assert entry["latency_class"] == "unknown"
        assert entry["capabilities"] == []

    def test_undocumented_model_without_a_prefix_defaults_to_litellm(self):
        entry = _entry_for("mystery-model")
        assert entry["known"] is False
        assert entry["provider"] == "litellm"
        assert entry["display_name"] == "mystery-model"

    def test_id_always_echoes_the_routed_name(self):
        # The panel keys rows by `id`. If it disagreed with the configured name
        # the "in use" badge would attach to nothing.
        for name in MODEL_CATALOG:
            assert _entry_for(name)["id"] == name
        assert _entry_for("acme/experimental-llm")["id"] == "acme/experimental-llm"

    def test_every_catalog_row_has_the_full_entry_shape(self):
        for name, meta in MODEL_CATALOG.items():
            missing = _ENTRY_KEYS - set(meta)
            assert not missing, f"{name} is missing {sorted(missing)}"

    def test_pricing_is_never_negative_or_free_for_public_models(self):
        # Cost is what the fallback chain sorts by; a stray 0.0 would jump a
        # model to the front of every chain it appears in.
        for name, meta in MODEL_CATALOG.items():
            if meta["provider"] == "local":
                continue
            assert meta["cost_per_1k_input"] > 0, name


class TestTaskRouting:
    def test_resolves_every_task_from_configuration(self, monkeypatch):
        _use(
            monkeypatch,
            LITELLM_MODEL="gpt-4o",
            LITELLM_JUDGE_MODEL="claude-3-haiku",
            EMBEDDING_MODEL="text-embedding-3-large",
        )
        models = _task_models()
        assert set(models) == set(ModelTask)
        assert models[ModelTask.chat] == "gpt-4o"
        assert models[ModelTask.judge] == "claude-3-haiku"
        assert models[ModelTask.embed] == "text-embedding-3-large"
        # generation and classification ride along with chat by design
        assert models[ModelTask.generate] == "gpt-4o"
        assert models[ModelTask.classify] == "gpt-4o"

    async def test_defaults_endpoint_is_the_flat_task_map(self, monkeypatch):
        _use(monkeypatch, LITELLM_MODEL="claude-3-5-sonnet")
        flat = await get_task_defaults(None)
        assert flat["chat"] == "claude-3-5-sonnet"
        assert flat["generate"] == "claude-3-5-sonnet"
        assert flat["embed"] == "text-embedding-3-small"
        assert set(flat) == {t.value for t in ModelTask}

    async def test_config_endpoint_reports_the_same_names(self, monkeypatch):
        """`/models/config` and `/models/defaults` must never disagree."""
        _use(monkeypatch, LITELLM_MODEL="gpt-4o", LITELLM_JUDGE_MODEL="claude-3-haiku")
        cfg = await get_router_config(None)
        flat = await get_task_defaults(None)
        assert cfg.chat_model == flat["chat"]
        assert cfg.judge_model == flat["judge"]
        assert cfg.generate_model == flat["generate"]
        assert cfg.classify_model == flat["classify"]
        assert cfg.embed_model == flat["embed"]


class TestFallbackChain:
    def test_never_offers_an_embedding_model_as_a_text_fallback(self, monkeypatch):
        """An embed-only model used to sit in the shared pool.

        It was therefore offered as a fallback for chat, judge, generate and
        classify. Routing a text task to it either fails or returns a vector
        where prose was expected, and nothing downstream checks for that — the
        stream would emit a blob as if it were the answer.
        """
        _use(monkeypatch, LITELLM_MODEL="gpt-4o", LITELLM_JUDGE_MODEL="gpt-4o")
        for task in (ModelTask.chat, ModelTask.judge, ModelTask.generate, ModelTask.classify):
            chain = _fallback_chain(task, "gpt-4o")
            assert chain, f"{task.value} had no chain to check"
            for name in chain:
                assert "embeddings" not in MODEL_CATALOG[name]["capabilities"], (task, name)
            assert "text-embedding-3-small" not in chain

    def test_embed_task_only_suggests_embedding_models(self, monkeypatch):
        _use(monkeypatch, EMBEDDING_MODEL="text-embedding-3-large")
        chain = _fallback_chain(ModelTask.embed, "text-embedding-3-large")
        assert chain == ["text-embedding-3-small"]
        for name in chain:
            assert "embeddings" in MODEL_CATALOG[name]["capabilities"]

    def test_fallbacks_are_ordered_by_ascending_cost(self, monkeypatch):
        # A fallback always trades some quality for cost, so the cheapest
        # plausible option comes first.
        _use(monkeypatch, LITELLM_MODEL="claude-3-5-sonnet")
        chain = _fallback_chain(ModelTask.chat, "claude-3-5-sonnet")
        assert chain == ["gpt-4o-mini", "claude-3-haiku"]
        costs = [MODEL_CATALOG[name]["cost_per_1k_input"] for name in chain]
        assert costs == sorted(costs)

    def test_primary_is_never_its_own_fallback(self, monkeypatch):
        _use(monkeypatch, LITELLM_MODEL="gpt-4o")
        for task in (ModelTask.chat, ModelTask.embed):
            primary = _task_models()[task]
            assert primary not in _fallback_chain(task, primary)

    def test_nothing_cheaper_yields_an_empty_chain(self):
        # gpt-4o-mini is the cheapest documented chat model that can answer.
        assert _fallback_chain(ModelTask.chat, "gpt-4o-mini") == []

    def test_an_undocumented_primary_gets_no_chain(self, monkeypatch):
        # Without a price there is no honest way to claim an alternative would
        # be cheaper, so we decline rather than guess.
        _use(monkeypatch, LITELLM_MODEL="acme/experimental-llm")
        assert _fallback_chain(ModelTask.chat, "acme/experimental-llm") == []

    def test_a_proxy_deployment_suggests_nothing(self, monkeypatch):
        """The operator's own model list is authoritative behind a proxy.

        Naming public endpoints there would propose routes the deployment may
        not even be able to reach, and would bypass a deliberate routing choice.
        """
        _use(
            monkeypatch,
            LITELLM_BASE_URL="http://litellm.internal:4000",
            LITELLM_MODEL="gpt-4o",
        )
        assert _fallback_chain(ModelTask.chat, "gpt-4o") == []

    def test_the_local_model_is_never_suggested(self, monkeypatch):
        # It is free, so it would sort first if cost were the only filter.
        # Routing to it is a privacy decision, not something to do implicitly.
        _use(monkeypatch, LITELLM_MODEL="claude-3-5-sonnet")
        assert "llama3.1:8b" not in _fallback_chain(ModelTask.chat, "claude-3-5-sonnet")


class TestRouterConfigEndpoint:
    async def test_reports_the_exact_routing_the_pipeline_runs(self, monkeypatch):
        _use(
            monkeypatch,
            LITELLM_MODEL="gpt-4o",
            LITELLM_JUDGE_MODEL="claude-3-haiku",
            EMBEDDING_MODEL="text-embedding-3-large",
        )
        cfg = await get_router_config(None)
        assert isinstance(cfg, ModelRouterConfig)
        assert cfg.chat_model == "gpt-4o"
        assert cfg.judge_model == "claude-3-haiku"
        assert cfg.generate_model == "gpt-4o"
        assert cfg.classify_model == "gpt-4o"
        assert cfg.embed_model == "text-embedding-3-large"
        assert set(cfg.fallbacks) == {t.value for t in ModelTask}

    async def test_no_reported_text_fallback_is_an_embedding_model(self, monkeypatch):
        _use(monkeypatch, LITELLM_MODEL="gpt-4o", LITELLM_JUDGE_MODEL="gpt-4o")
        cfg = await get_router_config(None)
        for task in ModelTask:
            if task is ModelTask.embed:
                continue
            for name in cfg.fallbacks[task.value]:
                assert "embeddings" not in MODEL_CATALOG[name]["capabilities"], (task, name)


class TestCatalogEndpoint:
    async def test_groups_by_provider_and_marks_the_models_in_use(self, monkeypatch):
        _use(monkeypatch, LITELLM_MODEL="gpt-4o")
        payload = await list_models(None)
        assert payload["proxy_configured"] is False
        assert {"openai", "anthropic", "local"} <= set(payload["models"])

        active = {e["id"] for e in _every_entry(payload) if e["is_default_for"]}
        assert {"gpt-4o", "gpt-4o-mini", "text-embedding-3-small"} <= active

    async def test_an_undocumented_routed_model_is_listed_not_omitted(self, monkeypatch):
        _use(monkeypatch, LITELLM_MODEL="acme/experimental-llm")
        matches = [
            e for e in _every_entry(await list_models(None)) if e["id"] == "acme/experimental-llm"
        ]
        assert len(matches) == 1
        assert matches[0]["known"] is False
        assert "chat" in matches[0]["is_default_for"]

    async def test_proxy_configuration_is_surfaced(self, monkeypatch):
        _use(monkeypatch, LITELLM_BASE_URL="http://litellm.internal:4000")
        assert (await list_models(None))["proxy_configured"] is True

    async def test_models_in_use_sort_to_the_top_of_each_provider(self):
        # The panel shows the list as-is; an operator should not have to hunt
        # for the row that is actually answering.
        payload = await list_models(None)
        for provider, entries in payload["models"].items():
            flags = [bool(e["is_default_for"]) for e in entries]
            assert flags == sorted(flags, reverse=True), provider
