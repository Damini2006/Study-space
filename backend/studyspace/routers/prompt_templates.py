"""Prompt Templates — save, share, and render Jinja2 templates."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from studyspace.deps import DbDep, UserDep
from studyspace.models.ai_intelligence import (
    PromptTemplate, PromptTemplateCreate, PromptTemplateUpdate,
    PromptTemplateType, RenderedPrompt,
)

router = APIRouter(prefix="/prompt-templates", tags=["prompt-templates"])


# Built-in system templates (fallback when no custom template exists)
SYSTEM_TEMPLATES: dict[str, dict] = {
    "chat_system": {
        "type": "chat_system",
        "template": (
            "You are {{ assistant_name }}, a study assistant for students.\n"
            "Rules:\n"
            "- Answer ONLY from the numbered passages in <context>.\n"
            "- Cite passages with [n] after each factual sentence.\n"
            "- Never invent passages or ids.\n"
            "- If passages don't contain the answer, reply with:\n"
            "  'I couldn't find this in your sources.'\n"
            "  Then list suggestions.\n"
            "{{ source_untrusted_marker }}"
        ),
        "variables": ["assistant_name", "source_untrusted_marker"],
    },
    "chat_user": {
        "type": "chat_user",
        "template": (
            "<context>\n{{ context }}\n</context>\n\nQuestion: {{ question }}"
        ),
        "variables": ["context", "question"],
    },
    "studio_summary": {
        "type": "studio_summary",
        "template": (
            "Write a markdown summary with a short intro, 3-6 key-point sections and a "
            "bullet list of takeaways. Cite passages inline with [n].\n\n"
            "{% if topic %}Topic focus: {{ topic }}\n\n{% endif %}"
            "Passages:\n\n{{ passages }}"
        ),
        "variables": ["topic", "passages"],
    },
    "studio_guide": {
        "type": "studio_guide",
        "template": (
            'Return JSON: {"title": str, "sections": [{"heading": str, "body": str, '
            '"citations": [int]}]} with 3-6 sections. "body" is markdown. "citations" '
            "lists the passage numbers that support the section.\n\n"
            "{% if topic %}Topic focus: {{ topic }}\n\n{% endif %}"
            "Passages:\n\n{{ passages }}"
        ),
        "variables": ["topic", "passages"],
    },
    "studio_flashcards": {
        "type": "studio_flashcards",
        "template": (
            f'Create exactly {{ count }} flashcards. Return JSON: {{"cards": [{{"front": str, '
            '"back": str, "tags": [str], "citation": int}]}}. Fronts are specific questions, '
            "backs are short precise answers (1-3 sentences) grounded in one passage.\n\n"
            "{% if topic %}Topic focus: {{ topic }}\n\n{% endif %}"
            "Passages:\n\n{{ passages }}"
        ),
        "variables": ["topic", "passages", "count"],
    },
    "studio_quiz": {
        "type": "studio_quiz",
        "template": (
            'Create exactly {{ count }} multiple-choice questions (4 options each). Return JSON: '
            '{"questions": [{"question": str, "options": [str, str, str, str], '
            '"answer_index": int, "explanation": str, "citation": int}]}}. '
            "answer_index is 0-3. Explanations cite [n] passage numbers.\n\n"
            "{% if topic %}Topic focus: {{ topic }}\n\n{% endif %}"
            "Passages:\n\n{{ passages }}"
        ),
        "variables": ["topic", "passages", "count"],
    },
    "judge_claims": {
        "type": "judge_claims",
        "template": (
            "You are a strict fact-checking judge. Decide whether each claim is fully "
            "supported by its evidence passages. Transitions and non-factual statements "
            "count as supported.\n\n"
            "{{ blocks }}\n\n"
            "Reply with JSON only: {\"claims\": [{\"index\": <int>, \"supported\": <bool>, "
            "\"score\": <0..1>}]} where index is the claim's number above."
        ),
        "variables": ["blocks"],
    },
    "socratic": {
        "type": "socratic",
        "template": (
            "Tutor mode: do NOT give the final answer directly. Ask short guiding "
            "questions and give small hints, each grounded in citations.\n"
            "Plain language, one step at a time, no lecture."
        ),
        "variables": [],
    },
}


@router.get("")
async def list_templates(
    db: DbDep,
    space_id: UUID | None = Query(None),
    type_: str | None = Query(None, alias="type"),
) -> list[dict]:
    """List prompt templates (global + space-specific)."""
    # Get custom templates from DB
    query = "select * from public.prompt_templates where 1=1"
    params = []
    if space_id:
        query += " and (space_id = $1 or space_id is null)"
        params.append(str(space_id))
    else:
        query += " and space_id is null"
    if type_:
        query += f" and type = ${len(params) + 1}"
        params.append(type_)
    query += " order by type, name"

    rows = await db.fetch(query, *params)
    custom = [dict(r) for r in rows]

    # Merge with system templates (system templates are defaults)
    all_templates = []
    for t in custom:
        all_templates.append({**t, "is_system": False})

    # Add system templates not overridden
    custom_types = {t["type"] for t in custom}
    for name, info in SYSTEM_TEMPLATES.items():
        if info["type"] not in custom_types:
            all_templates.append({
                "id": None,
                "name": name,
                "description": f"Built-in {info['type']} template",
                "type": info["type"],
                "template": info["template"],
                "variables": info["variables"],
                "version": 1,
                "is_system": True,
                "space_id": None,
                "created_by": None,
                "created_at": None,
                "updated_at": None,
            })

    return all_templates


@router.post("", status_code=201)
async def create_template(
    db: DbDep, user: UserDep, body: dict
) -> dict:
    """Create a custom prompt template."""
    # Validate type
    try:
        template_type = body.get("type")
        if template_type not in [t.value for t in __import__('studyspace.models.ai_intelligence', fromlist=['PromptTemplateType']).PromptTemplateType]:
            raise ValueError(f"Invalid type: {template_type}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    row = await db.fetchrow(
        "insert into public.prompt_templates (name, description, type, template, variables, space_id, created_by) "
        "values ($1, $2, $3, $4, $5, $6, $7) returning *",
        body["name"],
        body.get("description"),
        body["type"],
        body["template"],
        json.dumps(body.get("variables", [])),
        body.get("space_id"),
        user.id,
    )
    return dict(row)


@router.get("/{template_id}")
async def get_template(db: DbDep, template_id: str) -> dict:
    row = await db.fetchrow(
        "select * from public.prompt_templates where id = $1", template_id
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Template not found.")
    return dict(row)


@router.patch("/{template_id}")
async def update_template(
    db: DbDep, user: UserDep, template_id: str, body: dict
) -> dict:
    fields = {k: v for k, v in body.items() if k in ("name", "description", "template", "variables")}
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update.")
    if "variables" in fields:
        fields["variables"] = json.dumps(fields["variables"])

    sets = ", ".join(f"{k} = ${i + 2}" for i, k in enumerate(fields))
    row = await db.fetchrow(
        f"update public.prompt_templates set {sets}, updated_at = now() "
        "where id = $1 and created_by = $2 returning *",
        template_id, user.id, *fields.values(),
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Template not found or not yours.")
    return dict(row)


@router.delete("/{template_id}", status_code=204)
async def delete_template(db: DbDep, user: UserDep, template_id: str) -> None:
    result = await db.execute(
        "delete from public.prompt_templates where id = $1 and created_by = $2",
        template_id, user.id,
    )
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Template not found or not yours.")


@router.post("/{template_id}/render")
async def render_template(
    db: DbDep, template_id: str, variables: dict
) -> RenderedPrompt:
    """Render a template with given variables."""
    row = await db.fetchrow(
        "select * from public.prompt_templates where id = $1", template_id
    )
    if row is None:
        # Check system templates
        for name, info in SYSTEM_TEMPLATES.items():
            if name == template_id or info["type"] == template_id:
                # Simple render for system templates
                from jinja2 import Template
                t = Template(info["template"])
                rendered = t.render(**variables)
                if info["type"] in ("chat_system", "chat_user"):
                    return RenderedPrompt(
                        system=rendered if info["type"] == "chat_system" else None,
                        user=rendered if info["type"] == "chat_user" else None,
                        messages=[],
                    )
                return RenderedPrompt(messages=[{"role": "user", "content": rendered}])
        raise HTTPException(status_code=404, detail="Template not found.")

    from jinja2 import Template
    t = Template(row["template"])
    rendered = t.render(**variables)
    return RenderedPrompt(messages=[{"role": "user", "content": rendered}])