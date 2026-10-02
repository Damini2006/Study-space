"""Pydantic v2 request/response models — the API contract."""

from studyspace.models.analytics import AnalyticsSummary, HeatmapDay, SubjectTime, WeakTopic
from studyspace.models.chat import (
    ChatMessage,
    ChatRequest,
    ChatCitation,
    ChatThread,
    LayerToggles,
)
from studyspace.models.common import ErrorResponse, OkResponse
from studyspace.models.evals import EvalResultOut, EvalRunCreate, EvalRunOut
from studyspace.models.focus import FocusSessionCreate, FocusSessionOut
from studyspace.models.habits import HabitCreate, HabitLogCreate, HabitLogOut, HabitOut
from studyspace.models.mcp import McpTokenCreate, McpTokenOut
from studyspace.models.notes import NoteCreate, NoteOut, NoteUpdate
from studyspace.models.planner import GhostTask, PlannerRunCreate, PlannerRunOut
from studyspace.models.sources import PastedTextInput, SourceOut, UploadResponse
from studyspace.models.spaces import SpaceCreate, SpaceOut, SpaceUpdate
from studyspace.models.study import CardOut, DueOut, ReviewIn, ReviewOut
from studyspace.models.studio import StudioGenerateRequest, StudioOutputOut

__all__ = [
    "AnalyticsSummary",
    "CardOut",
    "ChatCitation",
    "ChatMessage",
    "ChatRequest",
    "ChatThread",
    "DueOut",
    "ErrorResponse",
    "EvalResultOut",
    "EvalRunCreate",
    "EvalRunOut",
    "FocusSessionCreate",
    "FocusSessionOut",
    "GhostTask",
    "HabitCreate",
    "HabitLogCreate",
    "HabitLogOut",
    "HabitOut",
    "HeatmapDay",
    "LayerToggles",
    "McpTokenCreate",
    "McpTokenOut",
    "NoteCreate",
    "NoteOut",
    "NoteUpdate",
    "OkResponse",
    "PastedTextInput",
    "PlannerRunCreate",
    "PlannerRunOut",
    "ReviewIn",
    "ReviewOut",
    "SourceOut",
    "SpaceCreate",
    "SpaceOut",
    "SpaceUpdate",
    "StudioGenerateRequest",
    "StudioOutputOut",
    "SubjectTime",
    "UploadResponse",
    "WeakTopic",
]
