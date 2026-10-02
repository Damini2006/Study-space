"""Postgres-backed LangGraph checkpointer (user-scoped, RLS-safe).

Implements ``BaseCheckpointSaver`` so ``interrupt()`` / ``Command(resume=...)``
survives API restarts. Rows live in ``public.planner_checkpoints`` with the
user's own ``user_id``, and every read/write goes through a user-scoped
connection — so checkpoint access is covered by the same RLS policies as the
rest of the app (no service-role key in the request path).
"""

from __future__ import annotations

import json
from typing import Any, Callable

from langgraph.checkpoint.base import BaseCheckpointSaver, CheckpointTuple


class PostgresCheckpointer(BaseCheckpointSaver):
    def __init__(self, conn_factory: Callable, user_id: str):
        super().__init__()
        self.conn_factory = conn_factory
        self.user_id = user_id

    # -- serialization helpers ---------------------------------------------
    def _dump(self, value: Any) -> Any:
        """Serialize with langgraph's serde into a JSON-compatible value."""
        try:
            typ, data = self.serde.dumps_typed(value)
            return {
                "t": typ,
                "d": data.decode("utf-8") if isinstance(data, bytes) else data,
                "b": isinstance(data, bytes),
            }
        except Exception:
            return value

    def _load(self, value: Any) -> Any:
        if value is None:
            return None
        if isinstance(value, dict) and "t" in value and "d" in value:
            try:
                data = value["d"]
                if value.get("b"):
                    import base64

                    data = base64.b64decode(data)
                return self.serde.loads_typed((value["t"], data))
            except Exception:
                return value
        return value

    @staticmethod
    def _config(thread_id: str, ns: str, checkpoint_id: str | None) -> dict:
        configurable: dict[str, Any] = {"thread_id": thread_id, "checkpoint_ns": ns}
        if checkpoint_id:
            configurable["checkpoint_id"] = checkpoint_id
        return {"configurable": configurable}

    # -- reads ---------------------------------------------------------------
    async def aget_tuple(self, config: dict) -> CheckpointTuple | None:
        thread_id = config["configurable"]["thread_id"]
        ns = config["configurable"].get("checkpoint_ns", "")
        async with self.conn_factory() as conn:
            row = await conn.fetchrow(
                "select checkpoint_id, parent_checkpoint_id, checkpoint, metadata, versions "
                "from public.planner_checkpoints "
                "where user_id = $1 and thread_id = $2 and checkpoint_ns = $3 "
                "order by checkpoint_id desc limit 1",
                self.user_id, thread_id, ns,
            )
            if row is None:
                return None
            writes = await conn.fetch(
                "select channel, task_id, value from public.planner_checkpoint_writes "
                "where user_id = $1 and thread_id = $2 and checkpoint_ns = $3 and checkpoint_id = $4",
                self.user_id, thread_id, ns, row["checkpoint_id"],
            )
        pending = [
            (w["task_id"], w["channel"], self._load(w["value"])) for w in writes
        ]
        return CheckpointTuple(
            config=self._config(thread_id, ns, row["checkpoint_id"]),
            checkpoint=self._load(row["checkpoint"]),
            metadata=self._load(row["metadata"]),
            parent_config=self._config(thread_id, ns, row["parent_checkpoint_id"])
            if row["parent_checkpoint_id"] else None,
            pending_writes=pending,
        )

    async def alist(self, config: dict, *, filter=None, before=None, limit: int | None = None, **kwargs):
        tup = await self.aget_tuple(config)
        return [tup] if tup else []

    # -- writes --------------------------------------------------------------
    async def aput(self, config: dict, checkpoint: dict, metadata: dict, new_versions: dict) -> dict:
        thread_id = config["configurable"]["thread_id"]
        ns = config["configurable"].get("checkpoint_ns", "")
        parent_id = config["configurable"].get("checkpoint_id")
        ckpt_id = checkpoint.get("id")
        async with self.conn_factory() as conn:
            await conn.execute(
                "insert into public.planner_checkpoints "
                "(user_id, thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, "
                " checkpoint, metadata, versions, channel_values) "
                "values ($1, $2, $3, $4, $5, $6, $7, $8, $9) "
                "on conflict (user_id, thread_id, checkpoint_ns, checkpoint_id) "
                "do update set checkpoint = excluded.checkpoint, metadata = excluded.metadata, "
                "versions = excluded.versions, channel_values = excluded.channel_values",
                self.user_id, thread_id, ns, ckpt_id, parent_id,
                self._dump(checkpoint), self._dump(metadata),
                self._dump(new_versions), self._dump(checkpoint.get("channel_values")),
            )
        return self._config(thread_id, ns, ckpt_id)

    async def aput_writes(self, config: dict, checkpoint_id: str, writes: list) -> None:
        thread_id = config["configurable"]["thread_id"]
        ns = config["configurable"].get("checkpoint_ns", "")
        async with self.conn_factory() as conn:
            for write in writes:
                if isinstance(write, (tuple, list)) and len(write) == 3:
                    task_id, channel, value = write
                else:  # pragma: no cover - alternate write shapes
                    task_id, channel, value = "unknown", "unknown", write
                await conn.execute(
                    "insert into public.planner_checkpoint_writes "
                    "(user_id, thread_id, checkpoint_ns, checkpoint_id, task_id, channel, value) "
                    "values ($1, $2, $3, $4, $5, $6, $7) "
                    "on conflict (user_id, thread_id, checkpoint_ns, checkpoint_id, task_id, channel) "
                    "do update set value = excluded.value",
                    self.user_id, thread_id, ns, checkpoint_id, task_id, channel,
                    self._dump(value),
                )

    # -- sync API (not used by async flows; kept concrete for the ABC) -------
    def get_tuple(self, config: dict):  # pragma: no cover - async-only deployment
        raise RuntimeError("PostgresCheckpointer is async-only; use aget_tuple().")

    def put(self, config, checkpoint, metadata, new_versions):  # pragma: no cover
        raise RuntimeError("PostgresCheckpointer is async-only; use aput().")

    def put_writes(self, config, checkpoint_id, writes):  # pragma: no cover
        raise RuntimeError("PostgresCheckpointer is async-only; use aput_writes().")

    async def alist_checkpoints(self, *args, **kwargs):  # pragma: no cover
        return []
