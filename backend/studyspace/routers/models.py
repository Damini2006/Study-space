"""Model catalog and per-task routing.

The router answers one question for the Settings UI: *which model is actually
answering my questions, and what does it cost?* It reports the deployment's real
configuration rather than a wish list — every "in use" badge is derived from
`get_settings()`, so the panel can never claim a model is active when the
pipeline is calling something else.
"""

from __future__ import annotations

from fastapi import APIRouter

from studyspace.config import get_settings
from studyspace.deps import UserDep
from studyspace.models.ai_intelligence import ModelTask

router = APIRouter(prefix="/models", tags=["models"])


# Metadata for models StudySpace can route to. Pricing is USD per 1k tokens and
# is used only to rank/annotate choices — nothing is billed through this table.
# Anything LiteLLM can address that isn't listed here still works; it just shows
# up with `known: false` so the UI can say "configured but undocumented" rather
# than silently omitting a model the pipeline is calling.
MODEL_CATALOG: dict[str, dict] = {
    "gpt-4o": {
        "provider": "openai",
        "model_id": "gpt-4o",
        "display_name": "GPT-4o",
        "max_tokens": 16384,
        "cost_per_1k_input": 0.0025,
        "cost_per_1k_output": 0.010,
        "latency_class": "fast",
        "capabilities": ["vision", "function_calling", "json"],
    },
    "gpt-4o-mini": {
        "provider": "openai",
        "model_id": "gpt-4o-mini",
        "display_name": "GPT-4o Mini",
        "max_tokens": 16384,
        "cost_per_1k_input": 0.00015,
        "cost_per_1k_output": 0.0006,
        "latency_class": "fast",
        "capabilities": ["vision", "function_calling", "json"],
    },
    "claude-3-5-sonnet": {
        "provider": "anthropic",
        "model_id": "claude-3-5-sonnet-20241022",
        "display_name": "Claude 3.5 Sonnet",
        "max_tokens": 8192,
        "cost_per_1k_input": 0.003,
        "cost_per_1k_output": 0.015,
        "latency_class": "medium",
        "capabilities": ["vision", "function_calling", "json"],
    },
    "claude-3-haiku": {
        "provider": "anthropic",
        "model_id": "claude-3-haiku-20240307",
        "display_name": "Claude 3 Haiku",
        "max_tokens": 4096,
        "cost_per_1k_input": 0.00025,
        "cost_per_1k_output": 0.00125,
        "latency_class": "fast",
        "capabilities": ["vision", "json"],
    },
    "llama3.1:8b": {
        "provider": "local",
        "model_id": "llama3.1:8b",
        "display_name": "Llama 3.1 8B (local)",
        "max_tokens": 8192,
        "cost_per_1k_input": 0.0,
        "cost_per_1k_output": 0.0,
        "latency_class": "slow",
        "capabilities": ["json"],
    },
    "text-embedding-3-small": {
        "provider": "openai",
        "model_id": "text-embedding-3-small",
        "display_name": "Text Embedding 3 Small",
        "max_tokens": 8191,
        "cost_per_1k_input": 0.00002,
        "cost_per_1k_output": 0.0,
        "latency_class": "fast",
        "capabilities": ["embeddings"],
    },
    "text-embedding-3-large": {
        "provider": "openai",
        "model_id": "text-embedding-3-large",
        "display_name": "Text Embedding 3 Large",
        "max_tokens": 8191,
        "cost_per_1k_input": 0.00013,
        "cost_per_1k_output": 0.0,
        "latency_class": "medium",
        "capabilities": ["embeddings"],
    },
}

# Which catalog entry each pipeline task falls back to. Keyed by the *configured*
# model name, so if an operator points LITELLM_MODEL at something undocumented,
# task routing still resolves and the catalog can flag it as unknown.
_TASK_FOR_MODEL = {
    "chat": "litellm_model",
    "judge": "litellm_judge_model",
    "generate": "litellm_model",
    "classify": "litellm_model",
    "embed": "embedding_model",
}


def _entry_for(model_name: str) -> dict:
    """Catalog metadata for ``model_name``, synthesising it when undocumented."""
    known = MODEL_CATALOG.get(model_name)
    if known:
        return {"id": model_name, **known, "known": True}
    # Derive the provider from a `provider/model` LiteLLM prefix when present.
    provider, _, bare = model_name.rpartition("/")
    return {
        "id": model_name,
        "provider": provider or "litellm",
        "model_id": model_name,
        "display_name": bare or model_name,
        "max_tokens": None,
        "cost_per_1k_input": None,
        "cost_per_1k_output": None,
        "latency_class": "unknown",
        "capabilities": [],
        "known": False,
    }


def _task_models() -> dict[ModelTask, str]:
    settings = get_settings()
    return {
        ModelTask.chat: settings.litellm_model,
        ModelTask.judge: settings.litellm_judge_model,
        # Generation reuses the chat model by design: studio output is the same
        # task as chat, just with a JSON-returning prompt.
        ModelTask.generate: settings.litellm_model,
        ModelTask.classify: settings.litellm_model,
        ModelTask.embed: settings.embedding_model,
    }


@router.get("/catalog")
async def list_models(_user: UserDep) -> dict:
    """Model catalog grouped by provider, with routing status per entry."""
    task_models = _task_models()
    routed_by: dict[str, list[str]] = {}
    for task, name in task_models.items():
        routed_by.setdefault(name, []).append(task.value)

    by_provider: dict[str, list[dict]] = {}
    for name in dict.fromkeys([*MODEL_CATALOG, *routed_by]):
        entry = _entry_for(name)
        entry["is_default_for"] = sorted(routed_by.get(name, []))
        by_provider.setdefault(entry["provider"], []).append(entry)

    for entries in by_provider.values():
        entries.sort(key=lambda e: (not e["is_default_for"], e["display_name"]))

    return {"models": by_provider, "proxy_configured": bool(get_settings().litellm_base_url)}


@router.get("/defaults")
async def get_task_defaults(_user: UserDep) -> dict[str, str]:
    """Flat ``task -> model`` map, the shape the Settings panel binds to."""
    return {task.value: name for task, name in _task_models().items()}
