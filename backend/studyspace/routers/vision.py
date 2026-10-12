"""Vision board — drag stickies and images (restored from the prototype).

Images go to the private `vision` bucket under the owner's folder (storage
RLS from 0007) and are served through short-lived signed URLs minted here,
so nothing is ever publicly readable.
"""

from __future__ import annotations

import base64
import uuid
from typing import Annotated

import httpx
from fastapi import APIRouter, File, HTTPException, Request, Response, UploadFile

from studyspace.config import get_settings
from studyspace.deps import DbDep
from studyspace.models.vision import (
    VisionBoardCreate,
    VisionBoardOut,
    VisionBoardUpdate,
    VisionItemCreate,
    VisionItemOut,
    VisionItemUpdate,
)
from studyspace.security import sanitize_filename

router = APIRouter(prefix="/vision", tags=["vision"])

_SELECT = (
    "select id, kind, text, color, x, y, width, height, rotation, z_index, "
    "image_path, board_id, created_at, updated_at from public.vision_items "
)


def _to_out(row, image_url: str | None = None) -> VisionItemOut:
    return VisionItemOut(
        id=row["id"], kind=row["kind"], text=row["text"], color=row["color"],
        x=row["x"], y=row["y"], width=row["width"], height=row["height"],
        rotation=row["rotation"], z_index=row["z_index"],
        image_path=row["image_path"], image_url=image_url,
        board_id=row["board_id"],
        created_at=row["created_at"], updated_at=row["updated_at"],
    )


async def _signed_url(path: str | None, token: str, kind: str) -> str | None:
    if kind != "image" or not path:
        return None
    settings = get_settings()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{settings.storage_base}/object/sign/vision/{path}",
            json={"expiresIn": 86400},
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": settings.supabase_anon_key,
                "Content-Type": "application/json",
            },
        )
    if resp.status_code >= 400:
        return None
    signed = resp.json().get("signedURL") or ""
    if not signed:
        return None
    return signed if signed.startswith("http") else f"{settings.storage_base}{signed}"


def _bearer(request: Request) -> str:
    return request.headers.get("authorization", "").split(" ", 1)[-1]


async def _data_uri(url: str) -> str | None:
    """Fetch a signed URL and inline the bytes as a data URI.

    Signed URLs expire, so an export that only referenced them would go
    blank the next day. Returns None when the bytes can't be fetched,
    letting the caller fall back to the URL it already has.
    """
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            resp = await client.get(url)
    except httpx.HTTPError:
        return None
    if resp.status_code >= 400 or not resp.content:
        return None
    mime = resp.headers.get("content-type", "").split(";")[0].strip()
    if not mime.startswith("image/"):
        mime = "image/png"
    encoded = base64.b64encode(resp.content).decode("ascii")
    return f"data:{mime};base64,{encoded}"


@router.get("", response_model=list[VisionItemOut])
async def list_items(request: Request, db: DbDep, board_id: uuid.UUID | None = None) -> list[VisionItemOut]:
    # A board filter only applies when the board is the caller's;
    # a foreign id matches nothing rather than leaking its items.
    if board_id is not None:
        owns = await db.fetchval(
            "select id from public.vision_boards where id = $1 and user_id = auth.uid()",
            board_id,
        )
        if owns is None:
            raise HTTPException(status_code=400, detail="Board not found.")
        rows = await db.fetch(
            _SELECT + "where user_id = auth.uid() and board_id = $1 order by z_index, created_at",
            board_id,
        )
    else:
        rows = await db.fetch(_SELECT + "where user_id = auth.uid() order by z_index, created_at")
    token = _bearer(request)
    out = []
    for r in rows:
        out.append(_to_out(r, await _signed_url(r["image_path"], token, r["kind"])))
    return out


@router.post("", response_model=VisionItemOut, status_code=201)
async def create_item(body: VisionItemCreate, db: DbDep) -> VisionItemOut:
    board_id = body.board_id
    if board_id is not None:
        owns = await db.fetchval(
            "select id from public.vision_boards where id = $1 and user_id = auth.uid()",
            board_id,
        )
        if owns is None:
            board_id = None
    row = await db.fetchrow(
        "insert into public.vision_items (kind, text, color, x, y, width, height, rotation, z_index, image_path, board_id) "
        "values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id, kind, text, color, x, y, "
        "width, height, rotation, z_index, image_path, board_id, created_at, updated_at",
        body.kind, body.text, body.color, body.x, body.y, body.width,
        body.height, body.rotation, body.z_index, body.image_path, board_id,
    )
    return _to_out(row)


@router.post("/upload", response_model=VisionItemOut, status_code=201)
async def upload_image(
    request: Request, db: DbDep, file: Annotated[UploadFile, File()]
) -> VisionItemOut:
    """Store an image in the `vision` bucket and create its board item."""
    settings = get_settings()
    original = sanitize_filename(file.filename or "image.png")
    ext = ("." + original.rsplit(".", 1)[-1].lower()) if "." in original else ".png"
    if ext not in (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"):
        raise HTTPException(status_code=400, detail="Only PNG, JPG, GIF, WEBP or SVG images are supported.")
    max_bytes = settings.max_upload_mb * 1024 * 1024
    data = await file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise HTTPException(status_code=413, detail=f"Image is larger than the {settings.max_upload_mb} MB limit.")

    user = request.state.verified_user
    token = _bearer(request)
    item_id = uuid.uuid4()
    path = f"{user.id}/{item_id}/{original}"

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{settings.storage_base}/object/vision/{path}",
            content=data,
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": settings.supabase_anon_key,
                "x-upsert": "true",
                "Content-Type": "application/octet-stream",
            },
        )
    if resp.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail="Image upload failed. Check SUPABASE_URL and that the `vision` bucket exists.",
        )

    row = await db.fetchrow(
        "insert into public.vision_items (id, kind, text, image_path, width, height) "
        "values ($1, 'image', '', $2, 320, 240) returning id, kind, text, color, x, y, "
        "width, height, rotation, z_index, image_path, created_at, updated_at",
        item_id, path,
    )
    url = await _signed_url(path, token, "image")
    return _to_out(row, url)


@router.patch("/{item_id}", response_model=VisionItemOut)
async def update_item(item_id: uuid.UUID, body: VisionItemUpdate, db: DbDep) -> VisionItemOut:
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update.")
    # A board_id is only honoured when it belongs to the caller.
    if "board_id" in fields and fields["board_id"] is not None:
        owns = await db.fetchval(
            "select id from public.vision_boards where id = $1 and user_id = auth.uid()",
            fields["board_id"],
        )
        if owns is None:
            raise HTTPException(status_code=400, detail="Board not found.")
    sets = ", ".join(f"{k} = ${i + 2}" for i, k in enumerate(fields))
    row = await db.fetchrow(
        f"update public.vision_items set {sets} where id = $1 and user_id = auth.uid() "
        "returning id, kind, text, color, x, y, width, height, rotation, z_index, "
        "image_path, board_id, created_at, updated_at",
        item_id, *fields.values(),
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Vision item not found.")
    return _to_out(row)


@router.delete("/{item_id}", status_code=204)
async def delete_item(request: Request, item_id: uuid.UUID, db: DbDep) -> None:
    row = await db.fetchrow(
        "delete from public.vision_items where id = $1 and user_id = auth.uid() "
        "returning image_path",
        item_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Vision item not found.")
    # best-effort object cleanup (row is already gone either way)
    path = row["image_path"]
    if path:
        settings = get_settings()
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                await client.delete(
                    f"{settings.storage_base}/object/vision/{path}",
                    headers={
                        "Authorization": f"Bearer {_bearer(request)}",
                        "apikey": settings.supabase_anon_key,
                    },
                )
        except httpx.HTTPError:
            pass


# ---------------------------------------------------------------------------
# Boards — named containers
# ---------------------------------------------------------------------------
@router.get("/boards", response_model=list[VisionBoardOut])
async def list_boards(db: DbDep) -> list[VisionBoardOut]:
    rows = await db.fetch(
        "select b.id, b.name, b.created_at, b.updated_at, "
        "  (select count(*) from public.vision_items i where i.board_id = b.id) as item_count "
        "from public.vision_boards b where b.user_id = auth.uid() "
        "order by b.created_at"
    )
    return [VisionBoardOut(**dict(r)) for r in rows]


@router.post("/boards", response_model=VisionBoardOut, status_code=201)
async def create_board(body: VisionBoardCreate, db: DbDep) -> VisionBoardOut:
    row = await db.fetchrow(
        "insert into public.vision_boards (name) values ($1) "
        "returning id, name, created_at, updated_at",
        body.name,
    )
    return VisionBoardOut(id=row["id"], name=row["name"], item_count=0,
                          created_at=row["created_at"], updated_at=row["updated_at"])


@router.patch("/boards/{board_id}", response_model=VisionBoardOut)
async def rename_board(board_id: uuid.UUID, body: VisionBoardUpdate, db: DbDep) -> VisionBoardOut:
    if not body.name:
        raise HTTPException(status_code=400, detail="No fields to update.")
    row = await db.fetchrow(
        "update public.vision_boards set name = $2 "
        "where id = $1 and user_id = auth.uid() "
        "returning id, name, created_at, updated_at",
        board_id, body.name,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Board not found.")
    count = await db.fetchval(
        "select count(*) from public.vision_items where board_id = $1", board_id
    )
    return VisionBoardOut(id=row["id"], name=row["name"], item_count=count,
                          created_at=row["created_at"], updated_at=row["updated_at"])


@router.delete("/boards/{board_id}", status_code=204)
async def delete_board(request: Request, board_id: uuid.UUID, db: DbDep) -> None:
    # Collect the image objects first: deleting the board
    # cascades to its items, so the paths must be read
    # before the rows go away.
    paths = await db.fetch(
        "select image_path from public.vision_items "
        "where board_id = $1 and user_id = auth.uid() and image_path is not null",
        board_id,
    )
    row = await db.fetchrow(
        "delete from public.vision_boards where id = $1 and user_id = auth.uid() returning id",
        board_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Board not found.")
    # best-effort storage cleanup (items are already gone)
    settings = get_settings()
    for p in paths:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                await client.delete(
                    f"{settings.storage_base}/object/vision/{p['image_path']}",
                    headers={
                        "Authorization": f"Bearer {_bearer(request)}",
                        "apikey": settings.supabase_anon_key,
                    },
                )
        except httpx.HTTPError:
            pass


# ---------------------------------------------------------------------------
# Export — a self-contained SVG image of a board
# ---------------------------------------------------------------------------
def _svg_export(items: list, title: str) -> str:
    """Render a board to an SVG. Stickies become coloured cards
    with their text; images are inlined as base64 data URIs so
    the file stands alone once downloaded."""
    width, height = 1200, 800
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" font-family="Inter, system-ui, sans-serif">',
        '<rect width="100%" height="100%" fill="#f6f7fb"/>',
    ]
    if title:
        parts.append(
            f'<text x="24" y="40" font-size="22" font-weight="700" fill="#1b2140">'
            f'{_escape_xml(title)}</text>'
        )
    for it in items:
        x = float(it["x"] or 0) + 40
        y = float(it["y"] or 0) + 70
        w = float(it["width"] or 200)
        h = float(it["height"] or 160)
        color = it["color"] or "#FFF9B3"
        rotation = float(it["rotation"] or 0)
        transform = f' transform="rotate({rotation} {x + w / 2} {y + h / 2})"' if rotation else ""
        if it["kind"] == "image" and (it.get("image_data") or it.get("image_url")):
            # Inlined bytes where we could get them, so the downloaded file
            # survives the signed URL expiring. The URL stays as a fallback
            # for the one image whose fetch failed.
            src = it.get("image_data") or it["image_url"]
            parts.append(
                f'<g{transform}><image x="{x}" y="{y}" width="{w}" height="{h}" '
                f'preserveAspectRatio="xMidYMid slice" href="{_escape_xml(src)}" '
                f'/><rect x="{x}" y="{y}" width="{w}" height="{h}" fill="none" '
                f'stroke="#d4d8e8" stroke-width="1" rx="8"/></g>'
            )
        else:
            text = (it["text"] or "").replace("\n", " ")
            parts.append(
                f'<g{transform}><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" '
                f'fill="{_escape_xml(color)}" stroke="#e2e5f0" stroke-width="1"/>'
                f'<text x="{x + 12}" y="{y + 28}" font-size="14" fill="#2b2f45">'
                f'{_escape_xml(text[:180])}</text></g>'
            )
    parts.append("</svg>")
    return "".join(parts)


def _escape_xml(text: str) -> str:
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


@router.get("/boards/{board_id}/export")
async def export_board(request: Request, board_id: uuid.UUID, db: DbDep) -> Response:
    board = await db.fetchrow(
        "select name from public.vision_boards where id = $1 and user_id = auth.uid()",
        board_id,
    )
    if board is None:
        raise HTTPException(status_code=404, detail="Board not found.")
    rows = await db.fetch(
        _SELECT + "where user_id = auth.uid() and board_id = $1 order by z_index, created_at",
        board_id,
    )
    token = _bearer(request)
    items = []
    for r in rows:
        item = dict(_to_out(r, await _signed_url(r["image_path"], token, r["kind"])).model_dump(mode="json"))
        if item["kind"] == "image" and item.get("image_url"):
            item["image_data"] = await _data_uri(item["image_url"])
        items.append(item)
    svg = _svg_export(items, board["name"])
    return Response(
        content=svg,
        media_type="image/svg+xml",
        headers={"Content-Disposition": f'attachment; filename="{_escape_xml(board["name"] or "board")}.svg"'},
    )
