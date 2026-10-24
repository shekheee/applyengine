"""The nightly review loop: the daily log handed to Claude, and the script's token."""
from __future__ import annotations

import hashlib
import secrets
from datetime import date
from typing import Any

from app.models import PrepAttempt, PrepRedo, PrepTask
from app.services.prep_schedule import EXTRA_SLOT, build_today

TOKEN_PREFIX = "prep_"


def new_review_token() -> tuple[str, str]:
    """A fresh token and the hash to store; the plain token is shown once."""
    token = TOKEN_PREFIX + secrets.token_urlsafe(32)
    return token, hash_review_token(token)


def hash_review_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _planned(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "task_id": item["task_id"],
        "title": item["title"],
        "type": item["type"],
        "slot": item["slot"],
        "target_minutes": item["target_minutes"],
        "badge": item["badge"],
        "done": item["done"],
    }


def build_daily_log(
    program: dict[str, Any],
    tasks: list[PrepTask],
    start_date: date,
    day: date,
    attempts: list[PrepAttempt],
    redos: list[PrepRedo],
) -> dict[str, Any]:
    """Everything the reviewer needs about one day, as plain JSON."""
    plan = build_today(tasks, start_date, day, attempts, redos)
    by_id = {task.id: task for task in tasks}
    todays = sorted((a for a in attempts if a.date == day), key=lambda a: (a.id or 0))

    def attempt_row(attempt: PrepAttempt) -> dict[str, Any]:
        task = by_id.get(attempt.task_id)
        return {
            "task_id": attempt.task_id,
            "title": attempt.title or (task.title if task else attempt.task_id),
            "type": task.type if task else "dsa",
            "pattern": task.pattern if task else None,
            "spec": task.spec if task else None,
            "target_minutes": task.target_minutes if task else 40,
            "elapsed_minutes": attempt.elapsed_minutes,
            "hint_used": attempt.hint_used,
            "solved": attempt.solved,
            "self_rating": attempt.self_rating,
            "complexity": attempt.complexity,
            "notes": attempt.notes,
            "code": attempt.code,
        }

    open_redos = sorted(
        (r for r in redos if not r.done and r.due_date <= day), key=lambda r: r.due_date
    )
    week_ids = {t.id for t in tasks if t.week == plan["week"] and t.slot != EXTRA_SLOT}
    done_ids = {a.task_id for a in attempts if a.date <= day}
    return {
        "program": program.get("name", "Interview Prep"),
        "date": day.isoformat(),
        "weekday": plan["weekday"],
        "week": plan["week"],
        "weeks": plan["weeks"],
        "status": plan["status"],
        "planned": [
            _planned(i)
            for i in plan["redos"] + plan["morning"] + plan["evening"] + plan["weekend"]
        ],
        "carried_over": [_planned(i) for i in plan["carried"]],
        "this_week": [_planned(i) for i in plan["weekly"]],
        "extra_practice": [_planned(i) for i in plan["extra"]],
        "attempts": [attempt_row(a) for a in todays],
        "streak": plan["streak"],
        "redos_due_or_overdue": [
            {
                "task_id": r.task_id,
                "title": by_id[r.task_id].title if r.task_id in by_id else r.task_id,
                "due_date": r.due_date.isoformat(),
                "reason": r.reason,
            }
            for r in open_redos
        ],
        "totals": {
            "today_done": plan["done_count"],
            "today_planned": plan["total_count"],
            "week_done": len(week_ids & done_ids),
            "week_planned": len(week_ids),
        },
    }
