"""Embeddings via LiteLLM (batched, provider-agnostic)."""

from __future__ import annotations

import litellm

from studyspace.config import get_settings


class EmbeddingError(RuntimeError):
    pass


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a list of texts (chunked into batches)."""
    if not texts:
        return []
    settings = get_settings()
    kwargs: dict = {"model": settings.embedding_model, "input": texts}
    if settings.litellm_api_key:
        kwargs["api_key"] = settings.litellm_api_key
    if settings.litellm_base_url:
        kwargs["api_base"] = settings.litellm_base_url

    vectors: list[list[float]] = []
    batch_size = max(1, settings.embedding_batch_size)
    for start in range(0, len(texts), batch_size):
        batch = texts[start : start + batch_size]
        try:
            response = await litellm.aembedding(**kwargs, input=batch)
        except Exception as exc:
            raise EmbeddingError(f"Embedding request failed: {exc}") from exc
        items = sorted(response.data, key=lambda d: d["index"])
        vectors.extend([item["embedding"] for item in items])

    for vec in vectors:
        if len(vec) != settings.embedding_dim:
            raise EmbeddingError(
                f"Embedding model returned {len(vec)} dims, expected {settings.embedding_dim}. "
                "Update EMBEDDING_DIM and the chunks.embedding vector(N) migration together."
            )
    return vectors


async def embed_query(text: str) -> list[float]:
    vectors = await embed_texts([text])
    return vectors[0]
