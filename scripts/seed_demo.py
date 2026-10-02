#!/usr/bin/env python3
"""Seed demo data for local development and CI.

Creates a test user with a seeded workspace if SUPABASE_URL points to a local Supabase.
Run after migrations: python scripts/seed_demo.py
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from studyspace.config import get_settings
from studyspace.db_service import service_conn
from studyspace.services.demo_seed import seed_demo

settings = get_settings()


async def main():
    if not settings.supabase_url or "localhost" not in settings.supabase_url:
        print("This script is for local development only (requires local Supabase).")
        print("Set SUPABASE_URL to your local Supabase instance (e.g., http://localhost:54321)")
        return

    print(f"Seeding demo data for {settings.supabase_url}...")

    async with service_conn() as conn:
        # Create or get test user
        test_user_id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
        await conn.execute(
            "insert into auth.users (id, email, encrypted_password, email_confirmed_at, role, aud) "
            "values ($1, $2, $3, now(), 'authenticated', 'authenticated') "
            "on conflict (id) do nothing",
            test_user_id,
            "demo@studyspace.local",
            "$2b$10$dummyhash",
        )

        # Seed the demo workspace
        result = await seed_demo(test_user_id, conn)

    print(f"✓ Demo seeded: {result}")


if __name__ == "__main__":
    asyncio.run(main())