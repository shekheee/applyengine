"""Interview Prep program seed: load prep_seed.json and upsert it into PrepTask."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from sqlmodel import Session

from app.models import PrepTask

SEED_PATH = Path(__file__).resolve().parent.parent / "data" / "prep_seed.json"
CONTENT_DIR = SEED_PATH.parent / "prep_content"
EXTRA_DIR = SEED_PATH.parent / "prep_extra"
TRACKS_DIR = SEED_PATH.parent / "prep_tracks"
_CONTENT_FIELDS = (
    "statement",
    "brief",
    "learn",
    "starter",
    "tests",
    "hints",
    "solution",
    "levels",
)

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
    "difficulty",
)


@lru_cache
def load_seed() -> dict[str, Any]:
    return json.loads(SEED_PATH.read_text(encoding="utf-8"))


@lru_cache
def load_extra() -> dict[str, Any]:
    """Tasks beyond the seed: the optional extra bank and the weekly tracks
    (challenges, fundamentals), as {"tasks": [...], "content": {id: ...}}."""
    tasks: list[dict[str, Any]] = []
    content: dict[str, dict[str, Any]] = {}
    paths = sorted(EXTRA_DIR.glob("*.json")) + sorted(TRACKS_DIR.glob("*.json"))
    for path in paths:
        part = json.loads(path.read_text(encoding="utf-8"))
        tasks += part["tasks"]
        content.update(part["content"])
    return {"tasks": tasks, "content": content}


@lru_cache
def load_content() -> dict[str, dict[str, Any]]:
    """Authored briefs, starters, tests, hints and solutions, keyed by task id."""
    merged: dict[str, dict[str, Any]] = {}
    for path in sorted(CONTENT_DIR.glob("*.json")):
        merged.update(json.loads(path.read_text(encoding="utf-8")))
    merged.update(load_extra()["content"])
    return merged


def program() -> dict[str, Any]:
    return load_seed()["program"]


def rules() -> dict[str, Any]:
    return load_seed()["rules"]


def sync_seed(
    session: Session,
    seed: dict[str, Any] | None = None,
    content: dict[str, dict[str, Any]] | None = None,
) -> int:
    """Insert or update every seed task keyed on its id. Safe to run repeatedly."""
    if seed is None:
        seed = {"tasks": load_seed()["tasks"] + load_extra()["tasks"]}
    content = load_content() if content is None else content
    count = 0
    for raw in seed["tasks"]:
        values = {field: raw.get(field) for field in _TASK_FIELDS}
        authored = content.get(raw["id"], {})
        for field in _CONTENT_FIELDS:
            values[field] = authored.get(field) or None
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
