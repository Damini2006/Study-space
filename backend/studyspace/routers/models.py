"""Model Router & Provider Management."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from studyspace.config import get_settings
from studyspace.models.ai_intelligence import (
    ModelProvider, ModelTask, ModelConfig, ModelRouterConfig,
)

router = APIRouter(prefix="/models", tags=["models"])


# Hardcoded catalog for now — in production this would come from DB/config
MODEL_CATALOG: dict[str, dict] = {
    # OpenAI
    "gpt-4o": {
        "provider": "openai",
        "model_id": "gpt-4o",
        "display_name": "GPT-4o",
        "max_tokens": 4096,
        "supports_streaming": True,
        "supports_json": True,
        "cost_per_1k_input": 0.005,
        "cost_per_1k_output": 0.015,
        "latency_class": "fast",
        "capabilities": ["vision", "function_calling"],
        "is_default_for": ["chat", "generate"],
    },
    "gpt-4o-mini": {
        "provider": "openai",
        "model_id": "gpt-4o-mini",
        "display_name": "GPT-4o Mini",
        "max_tokens": 4096,
        "supports_streaming": True,
        "supports_json": True,
        "cost_per_1k_input": 0.00015,
        "cost_per_1k_output": 0.0006,
        "latency_class": "fast",
        "capabilities": ["vision", "function_calling"],
        "is_default_for": ["chat", "generate", "classify"],
    },
    "gpt-4-turbo": {
        "provider": "openai",
        "model_id": "gpt-4-turbo",
        "display_name": "GPT-4 Turbo",
        "max_tokens": 4096,
        "supports_streaming": True,
        "supports_json": True,
        "cost_per_1k_input": 0.01,
        "cost_per_1k_output": 0.03,
        "latency_class": "medium",
        "capabilities": ["vision", "function_calling"],
    },
    # Anthropic
    "claude-3-5-sonnet": {
        "provider": "anthropic",
        "model_id": "claude-3-5-sonnet-20241022",
        "display_name": "Claude 3.5 Sonnet",
        "max_tokens": 4096,
        "supports_streaming": True,
        "supports_json": True,
        "cost_per_1k_input": 0.003,
        "cost_per_1k_output": 0.015,
        "latency_class": "medium",
        "capabilities": ["vision", "function_calling"],
        "is_default_for": ["judge", "generate"],
    },
    "claude-3-haiku": {
        "provider": "anthropic",
        "model_id": "claude-3-haiku-20240307",
        "display_name": "Claude 3 Haiku",
        "max_tokens": 4096,
        "supports_streaming": True,
        "supports_json": True,
        "cost_per_1k_input": 0.00025,
        "cost_per_1k_output": 0.00125,
        "latency_class": "fast",
        "capabilities": ["vision", "function_calling"],
        "is_default_for": ["classify"],
    },
    # Local via Ollama
    "llama3.1:8b": {
        "provider": "local",
        "model_id": "llama3.1:8b",
        "display_name": "Llama 3.1 8B (local)",
        "max_tokens": 4096,
        "supports_streaming": True,
        "supports_json": True,
        "cost_per_1k_input": 0.0,
        "cost_per_1k_output": 0.0,
        "latency_class": "slow",
        "capabilities": [],
    },
    # Embeddings
    "text-embedding-3-small": {
        "provider": "openai",
        "model_id": "text-embedding-3-small",
        "display_name": "text-embedding-3-small",
        "max_tokens": 8191,
        "supports_streaming": False,
        "supports_json": False,
        "cost_per_1k_input": 0.00002,
        "cost_per_1k_output": 0.0,
        "latency_class": "fast",
        "capabilities": ["embeddings"],
        "is_default_for": ["embed"],
    },
    "text-embedding-3-large": {
        "provider": "openai",
        "model_id": "text-embedding-3-large",
        "display_name": "text-embedding-3-large",
        "max_tokens": 8191,
        "supports_streaming": False,
        "supports_json": False,
        "cost_per_1k_input": 0.00013,
        "cost_per_1k_output": 0.0,
        "latency_class": "medium",
        "capabilities": ["embeddings"],
    },
    # Judge model (for claim verification)
    "gpt-4o-mini-judge": {
        "provider": "openai",
        "model_id": "gpt-4o-mini",
        "display_name": "GPT-4o Mini (Judge)",
        "max_tokens": 4096,
        "supports_streaming": True,
        "supports_json": True,
        "cost_per_1k_input": 0.00015,
        "cost_per_1k_output": 0.0006,
        "latency_class": "fast",
        "capabilities": ["json"],
        "is_default_for": ["judge"],
    },
}


def _get_current_config() -> dict:
    """Get current model router config from settings."""
    s = get_settings()
    return {
        "chat_model": s.litellm_chat_model,
        "judge_model": s.litellm_judge_model,
        "generate_model": s.litellm_chat_model,  # same as chat by default
        "embed_model": s.litellm_embed_model,
        "classify_model": s.litellm_chat_model,
        "fallbacks": {
            "chat": ["gpt-4o-mini", "claude-3-haiku"],
            "judge": ["gpt-4o-mini-judge", "claude-3-haiku"],
            "generate": ["gpt-4o-mini", "claude-3-haiku"],
            "embed": ["text-embedding-3-small"],
            "classify": ["gpt-4o-mini", "claude-3-haiku"],
        },
    }


@router.get("/catalog")
async def list_models() -> dict[str, list[dict]]:
    """List all available models grouped by provider."""
    by_provider: dict[str, list[dict]] = {}
    for model_id, info in MODEL_CATALOG.items():
        provider = info["provider"]
        if provider not in by_provider:
            by_provider[provider] = []
        by_provider[provider].append({"id": model_id, **info})
    return {"models": by_provider}


@router.get("/config", response_model=dict)
async def get_router_config() -> dict:
    """Get current model router configuration."""
    return _get_current_config()


# TODO: Add PATCH /config for admin updates (requires auth)
# TODO: Add per-user/model preferences


@router.get("/defaults")
async def get_task_defaults() -> dict[str, str]:
    """Get default model ID for each task."""
    s = get_settings()
    return {
        "chat": s.litellm_chat_model,
        "judge": s.litellm_judge_model,
        "generate": s.litellm_chat_model,
        "embed": s.litellm_embed_model,
        "classify": s.litellm_chat_model,
    }