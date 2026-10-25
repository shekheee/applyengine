"""Where the learner is weak, and what is due for long-term review.

Pure functions over tasks and attempts so the dashboard, the Today
scheduler and the checkpoints all read the same numbers.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from typing import Any

from app.models import PrepAttempt, PrepRedo, PrepTask

LONG_TERM_DAYS = 30
MIN_ATTEMPTS_TO_RANK = 2
CHECKLIST_NOTE = "Ticked from the Today checklist."
TYPE_LABELS = {
    "dsa": "DSA",
    "python": "Python",
    "drill": "AI drills",
    "lld": "Low-level design",
    "hld": "System design",
    "fundamentals": "LLM fundamentals",
    "challenge": "Challenges",
    "project": "Project",
}


def _target(task: PrepTask | None) -> int:
    return task.target_minutes if task else 40


def is_clean(attempt: PrepAttempt, task: PrepTask | None) -> bool:
    """Solved, no hint, within the target time."""
    return (
        attempt.solved == "yes"
        and not attempt.hint_used
        and attempt.elapsed_minutes <= _target(task)
    )


def is_tick(attempt: PrepAttempt) -> bool:
    """A quick checklist tick: it marks the task done but carries no signal."""
    return attempt.elapsed_minutes == 0 and attempt.notes == CHECKLIST_NOTE


def _group_stats(rows: list[tuple[PrepAttempt, PrepTask | None]]) -> dict[str, Any]:
    n = len(rows)
    solved = sum(1 for a, _ in rows if a.solved == "yes")
    hints = sum(1 for a, _ in rows if a.hint_used)
    over = sum(1 for a, t in rows if a.elapsed_minutes > _target(t))
    clean = sum(1 for a, t in rows if is_clean(a, t))
    ratio = sum(a.elapsed_minutes / max(_target(t), 1) for a, t in rows) / n
    solved_rate, hint_rate, over_rate = solved / n, hints / n, over / n
    return {
        "attempts": n,
        "tasks": len({a.task_id for a, _ in rows}),
        "solved_rate": round(solved_rate, 3),
        "clean_rate": round(clean / n, 3),
        "hint_rate": round(hint_rate, 3),
        "overtime_rate": round(over_rate, 3),
        "time_ratio": round(ratio, 2),
        "last_date": max(a.date for a, _ in rows).isoformat(),
        # Higher is weaker: unsolved counts most, then hints, then running over.
        "weakness": round(0.4 * (1 - solved_rate) + 0.35 * hint_rate + 0.25 * over_rate, 3),
    }


def _grouped(
    tasks_by_id: dict[str, PrepTask], attempts: list[PrepAttempt], key
) -> list[dict[str, Any]]:
    groups: dict[str, list[tuple[PrepAttempt, PrepTask | None]]] = defaultdict(list)
    for attempt in attempts:
        if is_tick(attempt):
            continue
        task = tasks_by_id.get(attempt.task_id)
        name = key(attempt, task)
        if name:
            groups[name].append((attempt, task))
    rows = [{"name": name, **_group_stats(items)} for name, items in groups.items()]
    return sorted(rows, key=lambda r: (-r["weakness"], -r["attempts"], r["name"]))


def pattern_of(attempt: PrepAttempt, task: PrepTask | None) -> str | None:
    if task is None:
        return "NeetCode 150" if attempt.task_id.startswith("nc-") else None
    return task.pattern if task.type == "dsa" else None


def weakest_patterns(
    tasks_by_id: dict[str, PrepTask], attempts: list[PrepAttempt], limit: int = 3
) -> list[dict[str, Any]]:
    """DSA patterns ranked weakest first, among those with enough attempts."""
    ranked = _grouped(tasks_by_id, attempts, pattern_of)
    return [r for r in ranked if r["attempts"] >= MIN_ATTEMPTS_TO_RANK and r["weakness"] > 0][
        :limit
    ]


def long_term_due(
    tasks_by_id: dict[str, PrepTask],
    attempts: list[PrepAttempt],
    redos: list[PrepRedo],
    today: date,
    days: int = LONG_TERM_DAYS,
) -> list[str]:
    """Tasks last done cleanly at least `days` ago, oldest first. Only attempts
    before today count, so an item reviewed today stays listed (as done) today."""
    latest: dict[str, PrepAttempt] = {}
    for attempt in attempts:
        if attempt.date >= today or attempt.task_id not in tasks_by_id:
            continue
        current = latest.get(attempt.task_id)
        if current is None or (attempt.date, attempt.id or 0) > (current.date, current.id or 0):
            latest[attempt.task_id] = attempt
    queued = {r.task_id for r in redos if not r.done}
    cutoff = today - timedelta(days=days)
    due = [
        (a.date, task_id)
        for task_id, a in latest.items()
        if a.date <= cutoff and task_id not in queued and is_clean(a, tasks_by_id[task_id])
    ]
    return [task_id for _, task_id in sorted(due)]


def build_insights(
    tasks: list[PrepTask],
    attempts: list[PrepAttempt],
    redos: list[PrepRedo],
    today: date,
) -> dict[str, Any]:
    tasks_by_id = {t.id: t for t in tasks}
    due = long_term_due(tasks_by_id, attempts, redos, today)
    attempts = [a for a in attempts if not is_tick(a)]
    recent_cut = today - timedelta(days=14)
    recent = [a for a in attempts if a.date > recent_cut]
    earlier = [a for a in attempts if a.date <= recent_cut]

    def clean_rate(rows: list[PrepAttempt]) -> float | None:
        if not rows:
            return None
        return round(sum(1 for a in rows if is_clean(a, tasks_by_id.get(a.task_id))) / len(rows), 3)

    return {
        "totals": {
            "attempts": len(attempts),
            "tasks": len({a.task_id for a in attempts}),
            "clean_rate": clean_rate(attempts),
            "recent_clean_rate": clean_rate(recent),
            "earlier_clean_rate": clean_rate(earlier),
        },
        "by_pattern": _grouped(tasks_by_id, attempts, pattern_of),
        "by_type": _grouped(
            tasks_by_id,
            attempts,
            lambda a, t: TYPE_LABELS.get(t.type if t else "dsa", "Other"),
        ),
        "weakest": weakest_patterns(tasks_by_id, attempts),
        "review_due": [
            {"task_id": task_id, "title": tasks_by_id[task_id].title} for task_id in due[:20]
        ],
    }
