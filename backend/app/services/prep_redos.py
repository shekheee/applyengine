"""When a prep attempt earns redos, and when they fall due (spec section 4)."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from app.models import PrepAttempt, PrepRedo

DEFAULT_OFFSETS = (3, 7)
DEFAULT_REDO_IF = ("hint_used", "over_time", "not_solved")


def redo_reasons(
    attempt: PrepAttempt, target_minutes: int, rules: dict[str, Any] | None = None
) -> list[str]:
    """Human-readable reasons this attempt should be redone; empty if none."""
    triggers = set((rules or {}).get("redo_if", DEFAULT_REDO_IF))
    reasons = []
    if "hint_used" in triggers and attempt.hint_used:
        reasons.append("hint used")
    if "over_time" in triggers and attempt.elapsed_minutes > target_minutes:
        reasons.append(f"over time ({round(attempt.elapsed_minutes)} > {target_minutes} min)")
    if "not_solved" in triggers and attempt.solved != "yes":
        reasons.append("solved partially" if attempt.solved == "partial" else "not solved")
    return reasons


def redo_dates(day: date, rules: dict[str, Any] | None = None) -> list[date]:
    offsets = (rules or {}).get("redo_offsets_days", DEFAULT_OFFSETS)
    return [day + timedelta(days=int(offset)) for offset in offsets]


def new_redos(
    attempt: PrepAttempt,
    target_minutes: int,
    open_redos: list[PrepRedo],
    rules: dict[str, Any] | None = None,
) -> list[PrepRedo]:
    """Redos to create for this attempt.

    `open_redos` are the task's unfinished redos still scheduled after the
    attempt's day. If any exist the task is already queued for another go,
    so a struggling redo does not stack a second pair on top.
    """
    reasons = redo_reasons(attempt, target_minutes, rules)
    if not reasons or open_redos:
        return []
    reason = ", ".join(reasons)
    return [
        PrepRedo(
            user_id=attempt.user_id,
            task_id=attempt.task_id,
            due_date=due,
            reason=reason,
            source_attempt_id=attempt.id,
        )
        for due in redo_dates(attempt.date, rules)
    ]
