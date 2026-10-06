"""Spaces CRUD + sharing & publishing."""

from __future__ import annotations

import secrets
import uuid

from fastapi import APIRouter, HTTPException

from studyspace.deps import DbDep
from studyspace.models.spaces import (
    SpaceCreate,
    SpaceOut,
    SpacePublicCreate,
    SpacePublicOut,
    SpaceShareCreate,
    SpaceShareListItem,
    SpaceShareOut,
    SpaceUpdate,
)

router = APIRouter(prefix="/spaces", tags=["spaces"])

_SPACE_SELECT = """
select sp.id, sp.title, sp.description, sp.subject, sp.color, sp.archived,
       sp.created_at, sp.updated_at,
       (select count(*) from public.sources s where s.space_id = sp.id)::int as source_count,
       (select count(*) from public.sources s where s.space_id = sp.id and s.status = 'ready')::int as ready_source_count,
       (select count(*) from public.cards c where c.space_id = sp.id)::int as card_count,
       (select count(*) from public.card_state cs
          join public.cards c on c.id = cs.card_id
         where c.space_id = sp.id and cs.due <= now() and not cs.suspended)::int as due_today
from public.spaces sp
"""


def _to_out(row) -> SpaceOut:
    return SpaceOut(
        id=row["id"],
        title=row["title"],
        description=row["description"],
        subject=row["subject"],
        color=row["color"],
        archived=row["archived"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        source_count=row["source_count"],
        ready_source_count=row["ready_source_count"],
        card_count=row["card_count"],
        due_today=row["due_today"],
    )


# ----- Core CRUD -----

@router.get("", response_model=list[SpaceOut])
async def list_spaces(db: DbDep, include_archived: bool = False) -> list[SpaceOut]:
    rows = await db.fetch(
        _SPACE_SELECT + " where sp.user_id = auth.uid() and ($1 or not sp.archived) order by sp.created_at desc",
        include_archived,
    )
    return [_to_out(r) for r in rows]


@router.post("", response_model=SpaceOut, status_code=201)
async def create_space(db: DbDep, body: SpaceCreate) -> SpaceOut:
    row = await db.fetchrow(
        "insert into public.spaces (title, description, subject, color) "
        "values ($1, $2, $3, $4) returning id",
        body.title, body.description, body.subject, body.color,
    )
    out = await db.fetchrow(_SPACE_SELECT + " where sp.id = $1", row["id"])
    return _to_out(out)


@router.get("/{space_id}", response_model=SpaceOut)
async def get_space(db: DbDep, space_id: uuid.UUID) -> SpaceOut:
    row = await db.fetchrow(_SPACE_SELECT + " where sp.id = $1", space_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Space not found.")
    return _to_out(row)


@router.patch("/{space_id}", response_model=SpaceOut)
async def update_space(db: DbDep, space_id: uuid.UUID, body: SpaceUpdate) -> SpaceOut:
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update.")
    sets = ", ".join(f"{k} = ${i + 2}" for i, k in enumerate(fields))
    await db.execute(
        f"update public.spaces set {sets} where id = $1", space_id, *fields.values()
    )
    row = await db.fetchrow(_SPACE_SELECT + " where sp.id = $1", space_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Space not found.")
    return _to_out(row)


@router.delete("/{space_id}", status_code=204)
async def delete_space(db: DbDep, space_id: uuid.UUID) -> None:
    result = await db.execute("delete from public.spaces where id = $1", space_id)
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Space not found.")


# ----- Sharing (invite links) -----

@router.post("/{space_id}/shares", response_model=SpaceShareOut, status_code=201)
async def create_share(
    db: DbDep,
    space_id: uuid.UUID,
    body: SpaceShareCreate,
) -> SpaceShareOut:
    # Verify ownership
    row = await db.fetchrow("select id from public.spaces where id = $1 and user_id = auth.uid()", space_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Space not found or not yours.")

    token = secrets.token_urlsafe(24)
    expires_at = None
    if body.expires_in_days:
        from datetime import datetime, timedelta
        expires_at = datetime.utcnow() + timedelta(days=body.expires_in_days)

    share = await db.fetchrow(
        "insert into public.space_shares (space_id, created_by, role, token, expires_at) "
        "values ($1, auth.uid(), $2, $3, $4) "
        "returning id, space_id, role, token, expires_at, created_at, revoked_at",
        space_id, body.role.value, token, expires_at,
    )
    return SpaceShareOut(**share)


@router.get("/{space_id}/shares", response_model=list[SpaceShareListItem])
async def list_shares(db: DbDep, space_id: uuid.UUID) -> list[SpaceShareListItem]:
    row = await db.fetchrow("select id from public.spaces where id = $1 and user_id = auth.uid()", space_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Space not found or not yours.")

    rows = await db.fetch(
        "select id, space_id, role, expires_at, created_at, revoked_at "
        "from public.space_shares where space_id = $1 order by created_at desc",
        space_id,
    )
    return [SpaceShareListItem(**r) for r in rows]


@router.delete("/{space_id}/shares/{share_id}", status_code=204)
async def revoke_share(db: DbDep, space_id: uuid.UUID, share_id: uuid.UUID) -> None:
    row = await db.fetchrow("select id from public.spaces where id = $1 and user_id = auth.uid()", space_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Space not found or not yours.")

    result = await db.execute(
        "update public.space_shares set revoked_at = now() where id = $1 and space_id = $2",
        share_id, space_id,
    )
    if result == "UPDATE 0":
        raise HTTPException(status_code=404, detail="Share not found.")


# ----- Public publishing -----

@router.post("/{space_id}/public", response_model=SpacePublicOut, status_code=201)
async def publish_space(
    db: DbDep,
    space_id: uuid.UUID,
    body: SpacePublicCreate,
) -> SpacePublicOut:
    row = await db.fetchrow("select id from public.spaces where id = $1 and user_id = auth.uid()", space_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Space not found or not yours.")

    # Check slug uniqueness
    existing = await db.fetchrow("select space_id from public.space_public where slug = $1", body.slug)
    if existing and existing["space_id"] != space_id:
        raise HTTPException(status_code=409, detail="Slug already taken.")

    pub = await db.fetchrow(
        "insert into public.space_public (space_id, slug, published_by) "
        "values ($1, $2, auth.uid()) "
        "on conflict (space_id) do update set slug = excluded.slug, unpublished_at = null, published_at = now() "
        "returning space_id, slug, published_at, unpublished_at",
        space_id, body.slug,
    )
    base = "http://localhost:5175"  # TODO: from config
    return SpacePublicOut(**pub, public_url=f"{base}/s/{pub['slug']}")


@router.get("/{space_id}/public", response_model=SpacePublicOut | None)
async def get_public_info(db: DbDep, space_id: uuid.UUID) -> SpacePublicOut | None:
    row = await db.fetchrow("select id from public.spaces where id = $1 and user_id = auth.uid()", space_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Space not found or not yours.")

    pub = await db.fetchrow(
        "select space_id, slug, published_at, unpublished_at from public.space_public where space_id = $1",
        space_id,
    )
    if pub is None:
        return None
    base = "http://localhost:5175"
    return SpacePublicOut(**pub, public_url=f"{base}/s/{pub['slug']}")


@router.delete("/{space_id}/public", status_code=204)
async def unpublish_space(db: DbDep, space_id: uuid.UUID) -> None:
    row = await db.fetchrow("select id from public.spaces where id = $1 and user_id = auth.uid()", space_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Space not found or not yours.")

    result = await db.execute(
        "update public.space_public set unpublished_at = now() where space_id = $1", space_id,
    )
    if result == "UPDATE 0":
        raise HTTPException(status_code=404, detail="Space was not published.")


# ----- Public read-only access (no auth required) -----

@router.get("/public/{slug}", response_model=SpaceOut)
async def get_public_space(db: DbDep, slug: str) -> SpaceOut:
    pub = await db.fetchrow(
        "select sp.* from public.space_public p "
        "join public.spaces sp on sp.id = p.space_id "
        "where p.slug = $1 and p.unpublished_at is null",
        slug,
    )
    if pub is None:
        raise HTTPException(status_code=404, detail="Public space not found.")
    return _to_out(pub)


# ----- Shared access via token (for invite links) -----

@router.get("/shared/{token}", response_model=SpaceOut)
async def get_shared_space(db: DbDep, token: str) -> SpaceOut:
    # Validate share token via function
    share = await db.fetchrow("select * from public.validate_space_share($1)", token)
    if share is None:
        raise HTTPException(status_code=404, detail="Invalid or expired invite link.")

    row = await db.fetchrow(_SPACE_SELECT + " where sp.id = $1", share["space_id"])
    if row is None:
        raise HTTPException(status_code=404, detail="Space not found.")
    return _to_out(row)
