"""Embeddings via LiteLLM (batched, provider-agnostic)."""

from __future__ import annotations

import hashlib
import math
import re

import litellm

from studyspace.config import get_settings

# Offline fallback: no API key, no network, deterministic. Selected by setting
# EMBEDDING_MODEL=local-hash.
LOCAL_MODEL = "local-hash"

_TOKEN_RE = re.compile(r"[a-z0-9]+")


class EmbeddingError(RuntimeError):
    pass


def _local_embed(text: str, dim: int) -> list[float]:
    """Feature-hashed bag-of-n-grams embedding, L2-normalised.

    Similar wording lands in the same buckets, so cosine similarity still ranks
    related passages together — enough for retrieval when no embedding API is
    reachable. Deterministic across processes/machines.
    """
    vec = [0.0] * dim
    tokens = _TOKEN_RE.findall(text.lower())
    grams = list(tokens)
    grams += [f"{a} {b}" for a, b in zip(tokens, tokens[1:], strict=False)]

    for gram in grams:
        digest = hashlib.md5(gram.encode("utf-8")).digest()
        idx = int.from_bytes(digest[:4], "big") % dim
        sign = 1.0 if digest[4] & 1 else -1.0
        # Sub-linear term frequency damping keeps long passages from dominating.
        vec[idx] += sign

    norm = math.sqrt(sum(v * v for v in vec))
    if norm:
        vec = [v / norm for v in vec]
    return vec


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a list of texts (chunked into batches)."""
    if not texts:
        return []
    settings = get_settings()

    if settings.embedding_model == LOCAL_MODEL:
        return [_local_embed(t, settings.embedding_dim) for t in texts]

    kwargs: dict = {"model": settings.embedding_model}
    if settings.litellm_api_key:
        kwargs["api_key"] = settings.litellm_api_key
    if settings.litellm_base_url:
        kwargs["api_base"] = settings.litellm_base_url

    vectors: list[list[float]] = []
    batch_size = max(1, settings.embedding_batch_size)
    for start in range(0, len(texts), batch_size):
        batch = texts[start : start + batch_size]
        try:
            response = await litellm.aembedding(**{**kwargs, "input": batch})
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
