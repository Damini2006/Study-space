"""Smoke test verify_token against a real local Supabase token."""
import asyncio
import sys

import httpx

from studyspace.config import get_settings
from studyspace.security import AuthError, verify_token

SETTINGS = get_settings()


async def main() -> int:
    email = "secprobe@example.com"
    password = "Sup3rSecret!pass"
    headers = {"apikey": SETTINGS.supabase_anon_key, "Content-Type": "application/json"}
    base = SETTINGS.supabase_url.rstrip("/")

    async with httpx.AsyncClient(timeout=20) as client:
        # 1. sign up (ignore failure if it already exists)
        await client.post(
            f"{base}/auth/v1/signup",
            json={"email": email, "password": password},
            headers=headers,
        )
        # 2. sign in
        r = await client.post(
            f"{base}/auth/v1/token?grant_type=password",
            json={"email": email, "password": password},
            headers=headers,
        )
        if r.status_code != 200:
            print("LOGIN FAILED", r.status_code, r.text[:300])
            return 1
        token = r.json()["access_token"]

    import base64
    import json as _json

    seg = token.split(".", 1)[0]
    header = _json.loads(base64.urlsafe_b64decode(seg + "=" * (-len(seg) % 4)))
    print("token alg:", header.get("alg"), "kid:", header.get("kid"))

    try:
        user = await verify_token(token)
    except AuthError as exc:
        print("VERIFY FAILED:", exc)
        return 1
    print("VERIFY OK:", user.id, user.email, user.role)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
