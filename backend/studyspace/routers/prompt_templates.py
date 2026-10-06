"""Prompt Templates — save, share, and render Jinja2 templates.

Templates are per-space overrides on top of the built-ins. A space that has no
custom template for a given type falls through to `SYSTEM_TEMPLATES`, so this
module doubles as the single source of truth for what the pipeline will send
when a user hasn't customised anything.

Rendering is deliberately done server-side, not in the browser: the pipeline runs
on the backend, so a preview that rendered locally could disagree with what
actually gets sent (autoescaping, custom filters, whitespace control). Previewing
through the same code path as production is the only honest option.
"""

from __future__ import annotations

import json
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from jinja2 import Environment, StrictUndefined, TemplateError

from studyspace.deps import DbDep, UserDep
from studyspace.models.ai_intelligence import (
    PromptTemplateCreate,
    PromptTemplateRendered,
    PromptTemplateType,
    PromptTemplateUpdate,
)

router = APIRouter(prefix="/prompt-templates", tags=["prompt-templates"])


# ---------------------------------------------------------------------------
# Rendering environment
# ---------------------------------------------------------------------------

# autoescape=False: these are prompts to an LLM, not HTML. Escaping would inject
# literal &lt;/context&gt; into the model's input and quietly break the grounding.
# StrictUndefined raises on a missing variable instead of rendering empty, which
# turns "forgot to pass context" into a loud 400 rather than an answer grounded
# on nothing.
_env = Environment(autoescape=False, undefined=StrictUndefined, keep_trailing_newline=True)


def _render(template: str, variables: dict[str, Any]) -> str:
    try:
        return _env.from_string(template).render(**variables)
    except TemplateError as exc:
        # StrictUndefined surfaces a missing variable as an UndefinedError, which
        # is a TemplateError — one handler covers both syntax and missing-var.
        raise HTTPException(
            status_code=400, detail=f"Template failed to render: {exc}"
        ) from exc


# Built-in templates, used when a space has no custom template for the type.
# These mirror the prompt construction in services/rag.py and services/studio.py.
SYSTEM_TEMPLATES: dict[str, dict[str, Any]] = {
    "chat_system": {
        "name": "Chat — system",
        "description": "Grounding rules for every answer: cite [n], never invent passages.",
        "template": (
            "You are {{ assistant_name }}, a study assistant for students.\n"
            "Rules:\n"
            "- Answer ONLY from the numbered passages in <context>.\n"
            "- Cite the passages that support each factual sentence with their bracketed ids, e.g. [1].\n"
            "- Cite every factual sentence. Never invent passages or ids.\n"
            "- If the passages do not contain the answer, reply with the suggested-reply heading "
            "and the suggestions provided below — do not guess.\n"
            "- Concise, friendly, sentence-case. Use short paragraphs or bullets.\n"
            "{{ source_untrusted_marker }}"
        ),
        "variables": ["assistant_name", "source_untrusted_marker"],
    },
    "chat_user": {
        "name": "Chat — user",
        "description": "Wraps the retrieved passages and the question.",
        "template": "<context>\n{{ context }}\n</context>\n\nQuestion: {{ question }}",
        "variables": ["context", "question"],
    },
    "socratic": {
        "name": "Socratic tutor",
        "description": "Guides the student to the answer instead of stating it.",
        "template": (
            "Tutor mode: do NOT give the final answer directly. Ask short guiding "
            "questions and give small hints, each grounded in citations.\n"
            "Plain language, one step at a time, no lecture."
        ),
        "variables": [],
    },
    "studio_summary": {
        "name": "Studio — summary",
        "description": "Markdown summary with key-point sections and takeaways.",
        "template": (
            "Write a markdown summary with a short intro, 3-6 key-point sections and a "
            "bullet list of takeaways. Cite passages inline with [n].\n"
            "{% if topic %}Topic focus: {{ topic }}\n\n{% endif %}"
            "Passages:\n\n{{ passages }}"
        ),
        "variables": ["topic", "passages"],
    },
    "studio_guide": {
        "name": "Studio — study guide",
        "description": "Structured guide: headings, prose, and per-section citations.",
        "template": (
            'Return JSON: {"title": str, "sections": [{"heading": str, "body": str, '
            '"citations": [int]}]} with 3-6 sections. "body" is markdown. "citations" '
            "lists the passage numbers that support the section.\n"
            "{% if topic %}Topic focus: {{ topic }}\n\n{% endif %}"
            "Passages:\n\n{{ passages }}"
        ),
        "variables": ["topic", "passages"],
    },
    "studio_flashcards": {
        "name": "Studio — flashcards",
        "description": "Question/answer pairs, each grounded in one passage.",
        "template": (
            "Create exactly {{ count }} flashcards. Return JSON: "
            '{"cards": [{"front": str, "back": str, "tags": [str], "citation": int}]}. '
            "Fronts are specific questions, backs are short precise answers (1-3 sentences) "
            "grounded in one passage.\n"
            "{% if topic %}Topic focus: {{ topic }}\n\n{% endif %}"
            "Passages:\n\n{{ passages }}"
        ),
        "variables": ["topic", "passages", "count"],
    },
    "studio_quiz": {
        "name": "Studio — quiz",
        "description": "Multiple-choice questions with an answer index and explanation.",
        "template": (
            "Create exactly {{ count }} multiple-choice questions (4 options each). Return JSON: "
            '{"questions": [{"question": str, "options": [str, str, str, str], '
            '"answer_index": int, "explanation": str, "citation": int}]}. '
            "answer_index is 0-3. Explanations cite [n] passage numbers.\n"
            "{% if topic %}Topic focus: {{ topic }}\n\n{% endif %}"
            "Passages:\n\n{{ passages }}"
        ),
        "variables": ["topic", "passages", "count"],
    },
    "judge_claims": {
        "name": "Judge — claim verification",
        "description": "Decides whether each claim is supported by its evidence passages.",
        "template": (
            "You are a strict fact-checking judge. Decide whether each claim is fully "
            "supported by its evidence passages. Transitions and non-factual statements "
            "count as supported.\n\n"
            "{{ blocks }}\n\n"
            'Reply with JSON only: {"claims": [{"index": <int>, "supported": <bool>, '
            '"score": <0..1>}]} where index is the claim\'s number above.'
        ),
        "variables": ["blocks"],
    },
}


def _system_row(type_: PromptTemplateType) -> dict[str, Any]:
    info = SYSTEM_TEMPLATES[type_.value]
    return {
        "id": None,
        "name": info["name"],
        "description": info["description"],
        "type": type_.value,
        "template": info["template"],
        "variables": info["variables"],
        "version": 1,
        "is_system": True,
        "space_id": None,
        "created_by": None,
        "created_at": None,
        "updated_at": None,
    }


def _hydrate(row: Any) -> dict[str, Any]:
    """Normalise a DB row to the JSON shape the client expects."""
    out = dict(row)
    # `variables` is jsonb; a caller may reasonably have written a bare list.
    if isinstance(out.get("variables"), str):
        try:
            out["variables"] = json.loads(out["variables"])
        except json.JSONDecodeError:
            out["variables"] = []
    out["variables"] = out.get("variables") or []
    out["is_system"] = False
    return out


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("")
async def list_templates(
    db: DbDep,
    space_id: Annotated[UUID | None, Query()] = None,
    type_: Annotated[str | None, Query(alias="type")] = None,
) -> list[dict]:
    """List templates visible in a space: its own, the global ones, and built-ins."""
    try:
        wanted = PromptTemplateType(type_) if type_ else None
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown template type '{type_}'. Expected one of: "
            + ", ".join(t.value for t in PromptTemplateType),
        ) from exc

    rows = await db.fetch(
        "select * from public.prompt_templates "
        "where (space_id is null or space_id = $1) "
        "  and ($2::text is null or type = $2) "
        "order by is_system, type, name",
        space_id,
        wanted.value if wanted else None,
    )
    custom = [_hydrate(r) for r in rows]

    # A custom template replaces the built-in of the same type, so the built-in
    # is only offered when nothing has overridden it.
    overridden = {t["type"] for t in custom}
    built_ins = [
        _system_row(t)
        for t in PromptTemplateType
        if t.value in SYSTEM_TEMPLATES and t.value not in overridden
    ]
    if wanted:
        built_ins = [t for t in built_ins if t["type"] == wanted.value]

    return custom + built_ins


@router.post("", status_code=201)
async def create_template(
    db: DbDep, user: UserDep, body: PromptTemplateCreate, space_id: Annotated[UUID | None, Query()] = None
) -> dict:
    """Create a custom template for a space.

    ``space_id`` may arrive in the body or the query string; the query string
    wins. A space is required: templates always belong to one, so there's no
    shared global slot for two users to collide in.
    """
    scope = space_id or body.space_id
    if scope is None:
        raise HTTPException(status_code=400, detail="space_id is required.")
    owned = await db.fetchval(
        "select 1 from public.spaces where id = $1 and user_id = auth.uid()", scope
    )
    if owned is None:
        raise HTTPException(status_code=404, detail="Space not found.")

    # One template per (space, type), so upsert rather than 409 — re-saving an
    # edited template is the common case, not an error. The conflict target has to
    # repeat the partial index's predicate, or Postgres won't match it. The
    # ownership guard on DO UPDATE keeps the upsert from ever overwriting a row
    # this user didn't create.
    row = await db.fetchrow(
        "insert into public.prompt_templates "
        "(name, description, type, template, variables, space_id, created_by) "
        "values ($1, $2, $3, $4, $5::jsonb, $6, $7) "
        "on conflict (space_id, type) where space_id is not null do update set "
        "  name = excluded.name, description = excluded.description, "
        "  template = excluded.template, variables = excluded.variables, "
        "  version = public.prompt_templates.version + 1, "
        "  updated_at = now() "
        "where public.prompt_templates.created_by = excluded.created_by "
        "returning *",
        body.name,
        body.description,
        body.type.value,
        body.template,
        json.dumps(body.variables),
        scope,
        user.id,
    )
    if row is None:
        raise HTTPException(
            status_code=409,
            detail=f"A {body.type.value} template already exists for this space.",
        )
    return _hydrate(row)


@router.get("/{template_id}")
async def get_template(db: DbDep, template_id: str) -> dict:
    """Fetch one template by id, or a built-in by its type name."""
    row = await db.fetchrow("select * from public.prompt_templates where id = $1", template_id)
    if row is not None:
        return _hydrate(row)
    try:
        type_ = PromptTemplateType(template_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Template not found.") from exc
    # The enum names more types than there are built-ins: `custom` and the three
    # layer knobs are valid values to *store* a row under, but there is nothing
    # to fall back to for them. Indexing SYSTEM_TEMPLATES blindly turned every
    # one of those into a KeyError, i.e. a 500 where a 404 was meant.
    if type_.value not in SYSTEM_TEMPLATES:
        raise HTTPException(status_code=404, detail="Template not found.")
    return _system_row(type_)


@router.patch("/{template_id}")
async def update_template(
    db: DbDep, user: UserDep, template_id: str, body: PromptTemplateUpdate
) -> dict:
    """Update a template the caller created."""
    fields = body.model_dump(exclude_none=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update.")
    if "variables" in fields:
        fields["variables"] = json.dumps(fields["variables"])

    assignments = []
    values: list[Any] = [template_id, user.id]
    for key, value in fields.items():
        # `key` is restricted to model fields, so it can't carry SQL — but
        # keep the cast explicit so `variables` lands as jsonb.
        values.append(value)
        assignments.append(
            f"{key} = ${len(values)}::jsonb" if key == "variables" else f"{key} = ${len(values)}"
        )

    row = await db.fetchrow(
        f"update public.prompt_templates set {', '.join(assignments)}, updated_at = now() "
        "where id = $1 and created_by = $2 returning *",
        *values,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Template not found or not yours.")
    return _hydrate(row)


@router.delete("/{template_id}", status_code=204)
async def delete_template(db: DbDep, user: UserDep, template_id: str) -> None:
    """Delete one of the caller's custom templates."""
    result = await db.execute(
        "delete from public.prompt_templates where id = $1 and created_by = $2",
        template_id, user.id,
    )
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Template not found or not yours.")


@router.post("/{template_id}/render", response_model=PromptTemplateRendered)
async def render_template(
    db: DbDep, template_id: str, variables: dict[str, Any]
) -> PromptTemplateRendered:
    """Render a template through the same path the pipeline uses.

    Chat templates split into a system/user pair; every other template is a
    single user message.
    """
    row = await db.fetchrow("select * from public.prompt_templates where id = $1", template_id)
    if row is not None:
        template_body = row["template"]
        type_ = PromptTemplateType(row["type"])
    else:
        try:
            info = SYSTEM_TEMPLATES[PromptTemplateType(template_id).value]
        except (KeyError, ValueError) as exc:
            raise HTTPException(status_code=404, detail="Template not found.") from exc
        template_body = info["template"]
        type_ = PromptTemplateType(template_id)

    rendered = _render(template_body, variables)
    if type_ is PromptTemplateType.chat_system:
        return PromptTemplateRendered(system=rendered)
    if type_ is PromptTemplateType.chat_user:
        return PromptTemplateRendered(user=rendered)
    return PromptTemplateRendered(messages=[{"role": "user", "content": rendered}])
