"""Vision board — drag stickies and images (restored from the prototype).

Images go to the private `vision` bucket under the owner's folder (storage
RLS from 0007) and are served through short-lived signed URLs minted here,
so nothing is ever publicly readable.
"""

from __future__ import annotations

import uuid

import httpx
from fastapi import APIRouter, File, HTTPException, Request, UploadFile

from studyspace.config import get_settings
from studyspace.deps import DbDep
from studyspace.models.vision import VisionItemCreate, VisionItemOut, VisionItemUpdate
from studyspace.security import sanitize_filename

router = APIRouter(prefix="/vision", tags=["vision"])

_SELECT = (
    "select id, kind, text, color, x, y, width, height, rotation, z_index, "
    "image_path, created_at, updated_at from public.vision_items "
)


def _to_out(row, image_url: str | None = None) -> VisionItemOut:
    return VisionItemOut(
        id=row["id"], kind=row["kind"], text=row["text"], color=row["color"],
        x=row["x"], y=row["y"], width=row["width"], height=row["height"],
        rotation=row["rotation"], z_index=row["z_index"],
        image_path=row["image_path"], image_url=image_url,
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


@router.get("", response_model=list[VisionItemOut])
async def list_items(request: Request, db: DbDep) -> list[VisionItemOut]:
    rows = await db.fetch(_SELECT + "where user_id = auth.uid() order by z_index, created_at")
    token = _bearer(request)
    out = []
    for r in rows:
        out.append(_to_out(r, await _signed_url(r["image_path"], token, r["kind"])))
    return out


@router.post("", response_model=VisionItemOut, status_code=201)
async def create_item(body: VisionItemCreate, db: DbDep) -> VisionItemOut:
    row = await db.fetchrow(
        "insert into public.vision_items (kind, text, color, x, y, width, height, rotation, z_index, image_path) "
        "values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id, kind, text, color, x, y, "
        "width, height, rotation, z_index, image_path, created_at, updated_at",
        body.kind, body.text, body.color, body.x, body.y, body.width,
        body.height, body.rotation, body.z_index, body.image_path,
    )
    return _to_out(row)


@router.post("/upload", response_model=VisionItemOut, status_code=201)
async def upload_image(
    request: Request, db: DbDep, file: UploadFile = File(...)
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
    sets = ", ".join(f"{k} = ${i + 2}" for i, k in enumerate(fields))
    row = await db.fetchrow(
        f"update public.vision_items set {sets} where id = $1 and user_id = auth.uid() "
        "returning id, kind, text, color, x, y, width, height, rotation, z_index, "
        "image_path, created_at, updated_at",
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
