"""AI Intelligence models — model routing, prompt templates, RAG settings, citation audit."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from studyspace.config import get_settings


# ============================================================
# Model Router
# ============================================================

class ModelProvider(str, Enum):
    openai = "openai"
    anthropic = "anthropic"
    litellm = "litellm"  # any provider via LiteLLM
    local = "local"  # ollama, vllm, etc.


class ModelTask(str, Enum):
    chat = "chat"              # general chat / answers
    judge = "judge"            # claim verification
    generate = "generate"      # studio generation (summary/guide/flashcards/quiz)
    embed = "embed"            # embeddings
    classify = "classify"      # relevance gate / routing


class ModelConfig(BaseModel):
    provider: ModelProvider
    model_id: str
    display_name: str
    max_tokens: int = 4096
    supports_streaming: bool = True
    supports_json: bool = True
    cost_per_1k_input: float = 0.0
    cost_per_1k_output: float = 0.0
    latency_class: str = "medium"  # "fast" | "medium" | "slow"
    capabilities: list[str] = []  # e.g. ["vision", "function_calling"]
    is_default_for: list[ModelTask] = []


class ModelRouterConfig(BaseModel):
    """Per-task model selection with fallbacks, as actually deployed."""
    chat_model: str
    judge_model: str
    generate_model: str
    embed_model: str
    classify_model: str
    # task -> ordered fallback chain, cheapest first
    fallbacks: dict[str, list[str]] = {}


# ============================================================
# Prompt Templates
# ============================================================

class PromptTemplateType(str, Enum):
    chat_system = "chat_system"
    chat_user = "chat_user"
    studio_summary = "studio_summary"
    studio_guide = "studio_guide"
    studio_flashcards = "studio_flashcards"
    studio_quiz = "studio_quiz"
    judge_claims = "judge_claims"
    socratic = "socratic"
    relevance_gate = "relevance_gate"
    citation_validation = "citation_validation"
    claim_verification = "claim_verification"
    custom = "custom"


class PromptTemplate(BaseModel):
    id: Optional[UUID] = None
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = None
    type: PromptTemplateType
    template: str  # Jinja2 template
    variables: list[str] = []  # expected template variables
    version: int = 1
    is_system: bool = False  # built-in templates
    space_id: Optional[UUID] = None  # null = global
    created_by: Optional[UUID] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class PromptTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    type: PromptTemplateType
    template: str = Field(min_length=1)
    variables: list[str] = Field(default_factory=list)
    # Required — templates always belong to a space, so there's no shared global
    # slot for two users to collide in. Accepted in the body for client
    # convenience; the router prefers a `?space_id=` query param when both appear.
    space_id: Optional[UUID] = None


class PromptTemplateUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    template: Optional[str] = Field(default=None, min_length=1)
    variables: Optional[list[str]] = None


class PromptTemplateRendered(BaseModel):
    """A rendered template, shaped for whichever role the type expects."""
    system: Optional[str] = None
    user: Optional[str] = None
    messages: list[dict[str, str]] = Field(default_factory=list)


# ============================================================
# RAG Settings (per-space)
# ============================================================

class RagSettings(BaseModel):
    """Effective retrieval config — what the pipeline actually runs with.

    Config-derived fields are defaulted from `get_settings()` rather than
    hardcoded, so they stay identical to `global_rag_config()`. Three places used
    to spell the global baseline out separately (`RagSettings`, `_defaults()` and
    `global_rag_config()`) and they had already drifted: this model claimed
    top_k=12 and threshold=0.35 while the pipeline ran 6 and 0.30. Anything that
    built a `RagSettings` from defaults alone reported a baseline the app would
    never actually use.
    """
    space_id: UUID
    # Retrieval
    top_k: int = Field(default_factory=lambda: get_settings().rag_top_k)
    vector_weight: float = 0.7
    fts_weight: float = 0.3
    rrf_k: int = Field(default_factory=lambda: get_settings().rag_rrf_k)
    # Reranking
    rerank_enabled: bool = Field(default_factory=lambda: get_settings().reranker != "none")
    rerank_model: str = Field(default_factory=lambda: get_settings().reranker_model)
    rerank_top_n: int = 8
    # Layers
    relevance_gate: bool = Field(default_factory=lambda: get_settings().layer_relevance_gate)
    relevance_threshold: float = Field(
        default_factory=lambda: float(get_settings().relevance_threshold)
    )
    citation_validation: bool = Field(
        default_factory=lambda: get_settings().layer_citation_validation
    )
    claim_verification: bool = Field(
        default_factory=lambda: get_settings().layer_claim_verification
    )
    # Generation
    temperature: float = 0.3
    max_tokens: int = Field(default_factory=lambda: get_settings().llm_max_output_tokens)
    socratic_mode: bool = False
    # Model overrides
    chat_model: Optional[str] = None
    judge_model: Optional[str] = None
    generate_model: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class RagSettingsUpdate(BaseModel):
    """Patch payload. Every field is optional; unset fields are left alone."""
    top_k: Optional[int] = Field(default=None, ge=1, le=50)
    vector_weight: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    fts_weight: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    rrf_k: Optional[int] = Field(default=None, ge=1, le=1000)
    rerank_enabled: Optional[bool] = None
    rerank_model: Optional[str] = Field(default=None, max_length=200)
    rerank_top_n: Optional[int] = Field(default=None, ge=1, le=20)
    relevance_gate: Optional[bool] = None
    relevance_threshold: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    citation_validation: Optional[bool] = None
    claim_verification: Optional[bool] = None
    temperature: Optional[float] = Field(default=None, ge=0.0, le=2.0)
    max_tokens: Optional[int] = Field(default=None, ge=256, le=8192)
    socratic_mode: Optional[bool] = None
    chat_model: Optional[str] = Field(default=None, max_length=200)
    judge_model: Optional[str] = Field(default=None, max_length=200)
    generate_model: Optional[str] = Field(default=None, max_length=200)


class RagSettingsResolved(BaseModel):
    """What the UI renders: the effective config plus provenance.

    `overridden` lists only fields that genuinely differ from the global default,
    so a no-op save doesn't make every control look customised.
    """
    resolved: RagSettings
    overridden: list[str] = Field(default_factory=list)
    is_default: bool = True


class RagConfig(BaseModel):
    """Pipeline-facing subset: the knobs retrieval and generation read directly."""
    top_k: int
    vector_weight: float
    fts_weight: float
    rrf_k: int
    rerank_enabled: bool
    rerank_top_n: int
    relevance_gate: bool
    relevance_threshold: float
    citation_validation: bool
    claim_verification: bool
    temperature: float
    max_tokens: int
    socratic_mode: bool
    # Per-task model overrides; None means "use the deployment default".
    chat_model: Optional[str] = None
    judge_model: Optional[str] = None
    generate_model: Optional[str] = None


# ============================================================
# Citation Audit
# ============================================================

class CitationAuditStatus(str, Enum):
    verified = "verified"             # chunk exists and is unchanged since the answer
    missing_chunk = "missing_chunk"   # the cited passage was deleted from the source
    stale = "stale"                   # source was edited after the answer was written
    broken = "broken"                 # the whole source is gone
    low_score = "low_score"           # citation was weak evidence even at answer time


class CitationAuditItem(BaseModel):
    citation_id: UUID
    message_id: UUID
    # Nullable: these are exactly the fields that go null when the evidence is
    # deleted, which is the case the audit exists to report.
    chunk_id: Optional[UUID] = None
    source_id: Optional[UUID] = None
    source_title: str = "(deleted source)"
    label: int
    quote: str = ""
    score: Optional[float] = None
    verified: bool = False
    status: CitationAuditStatus
    details: str
    created_at: datetime
    source_updated_at: Optional[datetime] = None


class CitationAuditReport(BaseModel):
    space_id: UUID
    total_citations: int
    verified: int
    issues: int
    # True when the row cap truncated the result, so the UI can say "first N"
    # instead of implying the whole space was covered.
    truncated: bool = False
    items: list[CitationAuditItem]
    generated_at: datetime


class CitationAuditRequest(BaseModel):
    source_ids: Optional[list[UUID]] = None
    since: Optional[datetime] = None  # only audit citations after this date