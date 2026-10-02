"""LiteLLM wrappers — provider-independent LLM access.

Model names come from settings (never hard-coded at call sites). Streaming,
JSON-mode and simple completions all funnel through here so Langfuse tracing,
retries and error mapping live in one place.
"""

from __future__ import annotations

import json
from typing import Any, AsyncIterator

import litellm

from studyspace.config import get_settings


class LLMError(RuntimeError):
    """A provider-level failure (surfaced as a safe message to clients)."""


def _client_kwargs() -> dict[str, Any]:
    settings = get_settings()
    kwargs: dict[str, Any] = {"model": settings.litellm_model}
    if settings.litellm_api_key:
        kwargs["api_key"] = settings.litellm_api_key
    if settings.litellm_base_url:
        kwargs["api_base"] = settings.litellm_base_url
    return kwargs


async def chat(
    messages: list[dict[str, str]],
    *,
    model: str | None = None,
    temperature: float = 0.2,
    max_tokens: int | None = None,
    json_mode: bool = False,
) -> str:
    """One-shot completion; returns the text content."""
    settings = get_settings()
    kwargs = _client_kwargs()
    if model:
        kwargs["model"] = model
    kwargs.update(
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens or settings.llm_max_output_tokens,
    )
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    try:
        response = await litellm.acompletion(**kwargs)
    except Exception as exc:  # litellm raises provider-specific errors
        raise LLMError(f"LLM request failed: {exc}") from exc
    content = response.choices[0].message.content
    return content or ""


async def stream(
    messages: list[dict[str, str]],
    *,
    model: str | None = None,
    temperature: float = 0.2,
    max_tokens: int | None = None,
) -> AsyncIterator[str]:
    """Yield text deltas as they arrive from the provider."""
    settings = get_settings()
    kwargs = _client_kwargs()
    if model:
        kwargs["model"] = model
    kwargs.update(
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens or settings.llm_max_output_tokens,
        stream=True,
    )
    try:
        async for chunk in await litellm.acompletion(**kwargs):
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            text = getattr(delta, "content", None)
            if text:
                yield text
    except LLMError:
        raise
    except Exception as exc:
        raise LLMError(f"LLM stream failed: {exc}") from exc


def extract_json(text: str) -> Any:
    """Pull the first JSON object/array out of a model response (tolerant)."""
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # find first balanced {...} or [...]
    for opener, closer in (("{", "}"), ("[", "]")):
        start = text.find(opener)
        if start == -1:
            continue
        depth = 0
        for i in range(start, len(text)):
            if text[i] == opener:
                depth += 1
            elif text[i] == closer:
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[start : i + 1])
                    except json.JSONDecodeError:
                        break
    raise LLMError("Model did not return parseable JSON")


async def chat_json(
    messages: list[dict[str, str]],
    *,
    model: str | None = None,
    temperature: float = 0.0,
) -> Any:
    """Completion in JSON mode with tolerant parsing."""
    try:
        raw = await chat(messages, model=model, temperature=temperature, json_mode=True)
    except LLMError:
        raw = await chat(messages, model=model, temperature=temperature, json_mode=False)
    return extract_json(raw)


__all__ = ["LLMError", "chat", "chat_json", "extract_json", "stream"]
