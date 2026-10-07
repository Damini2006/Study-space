"""Central configuration.

Every external dependency and safety limit is configured here via environment
variables (see `.env.example`). Nothing secret is ever hard-coded, and model
names live in config — never in call sites.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- core ---------------------------------------------------------------
    app_name: str = "StudySpace API"
    env: Literal["development", "test", "production"] = "development"
    debug: bool = False
    # Threshold for application output on the root logger. The request log
    # picks each record's level from the response status (2xx INFO, 4xx
    # WARNING, 5xx ERROR); this decides which of them reach the handler.
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"

    # --- Supabase -----------------------------------------------------------
    supabase_url: str = "http://localhost:54321"
    supabase_anon_key: str = ""
    # HS256 shared secret used by Supabase Auth for access tokens. When empty,
    # the backend falls back to Supabase's published JWKS (RS256 projects).
    supabase_jwt_secret: str = ""
    supabase_jwt_issuer: str = ""  # default: {supabase_url}/auth/v1
    supabase_jwt_audience: str = "authenticated"

    # --- Postgres (direct connection, used for user-scoped + service queries) -
    database_url: str = "postgresql://postgres:postgres@localhost:54322/postgres"
    db_pool_min: int = 1
    db_pool_max: int = 10
    # Role assumed by user-scoped connections AFTER claims injection. RLS is
    # the authorization boundary for every request handler.
    db_user_role: str = "authenticated"

    # --- Redis (rate limiting + ARQ) ----------------------------------------
    redis_url: str = "redis://localhost:6379/0"

    # --- LLM / embeddings (via LiteLLM, provider-agnostic) -------------------
    litellm_model: str = "gpt-4o-mini"
    litellm_judge_model: str = "gpt-4o-mini"
    litellm_api_key: str = ""  # falls back to OPENAI_API_KEY inside LiteLLM
    litellm_base_url: str = ""  # optional LiteLLM proxy / alternative provider
    embedding_model: str = "text-embedding-3-small"
    embedding_dim: int = 1536  # MUST match migrations (0002) and seed data
    embedding_batch_size: int = 64
    llm_max_output_tokens: int = 1200
    # Extra system-prompt persona hook (kept in config, not code)
    assistant_name: str = "StudySpace"

    # --- RAG pipeline --------------------------------------------------------
    rag_vector_candidates: int = 50
    rag_fts_candidates: int = 50
    rag_rrf_k: int = 60
    rag_top_k: int = 6
    reranker: Literal["none", "lexical", "cross-encoder", "cohere"] = "lexical"
    reranker_model: str = "rerank-english-v3.0"
    relevance_threshold: float = 0.30  # cosine similarity floor for the gate
    chunk_target_chars: int = 2600  # ~650 tokens
    chunk_overlap_chars: int = 300

    # --- hallucination layers (independently switchable) ---------------------
    layer_relevance_gate: bool = True
    layer_citation_validation: bool = True
    layer_claim_verification: bool = True

    # --- limits & validation -------------------------------------------------
    max_upload_mb: int = 10
    max_pages: int = 300
    max_pasted_chars: int = 100_000
    storage_quota_mb: int = 500
    # CSV strings see above for list-typed settings
    allowed_extensions: str = ".pdf,.docx,.txt,.md,.markdown"
    allowed_mime_types: str = (
        "application/pdf,"
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document,"
        "text/plain,"
        "text/markdown,"
        "application/octet-stream"
    )
    max_source_title: int = 200

    # --- rate limits (per user unless noted) ---------------------------------
    rate_limit_chat_per_min: int = 20
    rate_limit_upload_per_5min: int = 10
    rate_limit_studio_per_10min: int = 15
    rate_limit_auth_per_min: int = 30  # per IP
    rate_limit_client_errors_per_min: int = 30  # per IP, anonymous

    # --- CORS ----------------------------------------------------------------
    # CSV strings are used for list settings to avoid JSON-decode issues when
    # the variable is set from a plain environment (non-JSON) value.
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # --- observability (Langfuse) -------------------------------------------
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    langfuse_host: str = "https://cloud.langfuse.com"
    langfuse_enabled: bool = False

    # --- demo / admin --------------------------------------------------------
    demo_enabled: bool = True
    admin_emails: str = ""

    # --- planner -------------------------------------------------------------
    planner_horizon_days: int = 21
    planner_max_tasks: int = 14

    # --- MCP -----------------------------------------------------------------
    mcp_token_prefix: str = "ssk_"

    # --- validators ----------------------------------------------------------
    @field_validator("cors_origins", "admin_emails", "allowed_extensions", "allowed_mime_types", mode="before")
    @classmethod
    def _split_string_tuples(cls, v: object) -> object:
        # tolerate JSON-style '["a","b"]' values too
        if isinstance(v, (list, tuple)):
            return ",".join(str(x) for x in v)
        return v

    # --- computed list views ------------------------------------------------
    @property
    def cors_origin_list(self) -> tuple[str, ...]:
        return tuple(x.strip() for x in self.cors_origins.split(",") if x.strip())

    @property
    def admin_email_set(self) -> tuple[str, ...]:
        return tuple(x.strip().lower() for x in self.admin_emails.split(",") if x.strip())

    @property
    def allowed_extension_set(self) -> tuple[str, ...]:
        return tuple(x.strip() for x in self.allowed_extensions.split(",") if x.strip())

    @property
    def allowed_mime_type_set(self) -> tuple[str, ...]:
        return tuple(x.strip() for x in self.allowed_mime_types.split(",") if x.strip())

    @property
    def jwt_issuer(self) -> str:
        if self.supabase_jwt_issuer:
            return self.supabase_jwt_issuer
        return f"{self.supabase_url.rstrip('/')}/auth/v1"

    @property
    def storage_base(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/storage/v1"


class SettingsError(RuntimeError):
    """Raised when a required setting is missing in the current environment."""


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

__all__ = ["Settings", "SettingsError", "get_settings", "settings"]
