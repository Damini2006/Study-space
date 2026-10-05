"""AI Intelligence models — model routing, prompt templates, RAG settings, citation audit."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


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
    """Per-task model selection with fallbacks."""
    # Primary model per task
    chat_model: str
    judge_model: str
    generate_model: str
    embed_model: str
    classify_model: str
    # Fallback chains (ordered)
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
    description: Optional[str] = None
    type: PromptTemplateType
    template: str
    variables: list[str] = []


class PromptTemplateUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = None
    template: Optional[str] = None
    variables: Optional[list[str]] = None


class RenderedPrompt(BaseModel):
    system: Optional[str] = None
    user: Optional[str] = None
    messages: list[dict[str, str]] = []


# ============================================================
# RAG Settings (per-space)
# ============================================================

class RagSettings(BaseModel):
    """Per-space RAG configuration (overrides global settings)."""
    space_id: UUID
    # Retrieval
    top_k: int = 12
    vector_weight: float = 0.7
    fts_weight: float = 0.3
    rrf_k: int = 60
    # Reranking
    rerank_enabled: bool = True
    rerank_model: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    rerank_top_n: int = 8
    # Layers
    relevance_gate: bool = True
    relevance_threshold: float = 0.35
    citation_validation: bool = True
    claim_verification: bool = True
    # Generation
    temperature: float = 0.3
    max_tokens: int = 2048
    socratic_mode: bool = False
    # Model overrides
    chat_model: Optional[str] = None
    judge_model: Optional[str] = None
    generate_model: Optional[str] = None


class RagSettingsUpdate(BaseModel):
    top_k: Optional[int] = Field(default=None, ge=1, le=50)
    vector_weight: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    fts_weight: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    rerank_enabled: Optional[bool] = None
    rerank_top_n: Optional[int] = Field(default=None, ge=1, le=20)
    relevance_gate: Optional[bool] = None
    relevance_threshold: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    citation_validation: Optional[bool] = None
    claim_verification: Optional[bool] = None
    temperature: Optional[float] = Field(default=None, ge=0.0, le=2.0)
    max_tokens: Optional[int] = Field(default=None, ge=256, le=8192)
    socratic_mode: Optional[bool] = None
    chat_model: Optional[str] = None
    judge_model: Optional[str] = None
    generate_model: Optional[str] = None


# ============================================================
# Citation Audit
# ============================================================

class CitationAuditStatus(str, Enum):
    verified = "verified"       # citation maps to valid chunk
    missing_chunk = "missing_chunk"  # chunk_id not found
    stale = "stale"             # source was updated after citation created
    broken = "broken"           # source deleted / inaccessible
    low_score = "low_score"     # retrieval score below threshold


class CitationAuditItem(BaseModel):
    message_id: UUID
    chunk_id: UUID
    source_id: UUID
    source_title: str
    label: int
    quote: str
    score: float
    verified: bool
    status: CitationAuditStatus
    details: str
    created_at: datetime
    source_updated_at: Optional[datetime] = None


class CitationAuditReport(BaseModel):
    space_id: UUID
    total_citations: int
    verified: int
    issues: int
    items: list[CitationAuditItem]
    generated_at: datetime


class CitationAuditRequest(BaseModel):
    space_id: UUID
    source_ids: Optional[list[UUID]] = None
    since: Optional[datetime] = None  # only audit citations after this date