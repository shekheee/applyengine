"""Interview Prep program seed: load prep_seed.json and upsert it into PrepTask."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from sqlmodel import Session

from app.models import PrepTask

SEED_PATH = Path(__file__).resolve().parent.parent / "data" / "prep_seed.json"

_TASK_FIELDS = (
    "type",
    "week",
    "order",
    "day",
    "slot",
    "title",
    "url",
    "pattern",
    "spec",
    "extensions",
    "framework",
    "target_minutes",
    "stretch",
    "editor",
)


@lru_cache
def load_seed() -> dict[str, Any]:
    return json.loads(SEED_PATH.read_text(encoding="utf-8"))


def program() -> dict[str, Any]:
    return load_seed()["program"]


def rules() -> dict[str, Any]:
    return load_seed()["rules"]


def sync_seed(session: Session, seed: dict[str, Any] | None = None) -> int:
    """Insert or update every seed task keyed on its id. Safe to run repeatedly."""
    seed = seed or load_seed()
    count = 0
    for raw in seed["tasks"]:
        values = {field: raw.get(field) for field in _TASK_FIELDS}
        values["order"] = values["order"] or 0
        values["stretch"] = bool(values["stretch"])
        values["editor"] = bool(values["editor"])
        task = session.get(PrepTask, raw["id"])
        if task is None:
            task = PrepTask(id=raw["id"], **values)
        else:
            for field, value in values.items():
                setattr(task, field, value)
        session.add(task)
        count += 1
    session.commit()
    return count
