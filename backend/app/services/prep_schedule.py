"""Decide what the Interview Prep program asks for on a given day.

Pure functions over tasks, attempts and redos so the rules in
PREP_MODULE_SPEC.md section 5 can be unit-tested without a database.
"""
from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from datetime import date, timedelta
from typing import Any

from app.models import PrepAttempt, PrepRedo, PrepTask

PROGRAM_WEEKS = 10
MORNING_DSA_PER_DAY = 2
STREAK_MIN_TASKS = 2
NEETCODE_URL = "https://neetcode.io/practice"
WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


def weekday_label(day: date) -> str:
    return WEEKDAYS[day.weekday()]


def program_week(start_date: date, today: date) -> int:
    """Week number (1-10) for today; 0 before the program starts."""
    if today < start_date:
        return 0
    return min((today - start_date).days // 7 + 1, PROGRAM_WEEKS)


def week_start(start_date: date, week: int) -> date:
    return start_date + timedelta(days=7 * (week - 1))


def scheduled_date(task: PrepTask, start_date: date) -> date | None:
    """The calendar date a weekday-bound or weekend task falls on, else None."""
    first = week_start(start_date, task.week)
    window = [first + timedelta(days=i) for i in range(7)]
    if task.day:
        return next(d for d in window if weekday_label(d) == task.day)
    if task.slot == "weekend":
        return next(d for d in window if weekday_label(d) == "Sat")
    return None


def neetcode_task_id(day: date) -> str:
    return f"nc-{day.isoformat()}"


def completions_by_date(attempts: Iterable[PrepAttempt]) -> dict[date, set[str]]:
    by_date: dict[date, set[str]] = defaultdict(set)
    for attempt in attempts:
        by_date[attempt.date].add(attempt.task_id)
    return by_date


def streaks(attempts: Iterable[PrepAttempt], today: date) -> dict[str, int]:
    """Current and best run of days with at least STREAK_MIN_TASKS completions.

    Today only extends the streak once it qualifies; an unfinished today does
    not break a streak that ran through yesterday.
    """
    by_date = completions_by_date(attempts)
    qualifying = sorted(d for d, ids in by_date.items() if len(ids) >= STREAK_MIN_TASKS)
    best = run = 0
    previous: date | None = None
    for day in qualifying:
        run = run + 1 if previous and day - previous == timedelta(days=1) else 1
        best = max(best, run)
        previous = day

    qualifying_set = set(qualifying)
    cursor = today if today in qualifying_set else today - timedelta(days=1)
    current = 0
    while cursor in qualifying_set:
        current += 1
        cursor -= timedelta(days=1)
    today_count = len(by_date.get(today, set()))
    return {
        "current": current,
        "best": best,
        "today_count": today_count,
        "needed_today": max(STREAK_MIN_TASKS - today_count, 0),
    }


def _task_item(task: PrepTask, *, done: bool, badge: str | None = None) -> dict[str, Any]:
    return {
        "key": task.id,
        "task_id": task.id,
        "type": task.type,
        "title": task.title,
        "url": task.url,
        "pattern": task.pattern,
        "slot": task.slot,
        "week": task.week,
        "target_minutes": task.target_minutes,
        "stretch": task.stretch,
        "badge": badge,
        "done": done,
        "redo_id": None,
        "due_date": None,
        "reason": None,
    }


def _redo_item(
    redo: PrepRedo, task: PrepTask | None, *, done: bool, badge: str
) -> dict[str, Any]:
    item = _task_item(task, done=done, badge=badge) if task else {
        "task_id": redo.task_id,
        "type": "dsa",
        "title": redo.task_id,
        "url": NEETCODE_URL,
        "pattern": None,
        "slot": "morning",
        "week": PROGRAM_WEEKS,
        "target_minutes": 40,
        "stretch": False,
        "badge": badge,
        "done": done,
    }
    item.update(
        key=f"redo-{redo.id}",
        redo_id=redo.id,
        due_date=redo.due_date.isoformat(),
        reason=redo.reason,
    )
    return item


def build_today(
    tasks: list[PrepTask],
    start_date: date,
    today: date,
    attempts: list[PrepAttempt],
    redos: list[PrepRedo],
) -> dict[str, Any]:
    week = program_week(start_date, today)
    by_date = completions_by_date(attempts)
    done_before = {tid for d, ids in by_date.items() if d < today for tid in ids}
    done_today = by_date.get(today, set())
    weekday = weekday_label(today)
    by_id = {task.id: task for task in tasks}
    ordered = sorted(tasks, key=lambda t: (t.week, t.order, t.id))

    result: dict[str, Any] = {
        "status": "not_started" if week == 0 else (
            "complete" if (today - start_date).days >= 7 * PROGRAM_WEEKS else "active"
        ),
        "week": week,
        "weeks": PROGRAM_WEEKS,
        "weekday": weekday,
        "start_date": start_date.isoformat(),
        "days_until_start": max((start_date - today).days, 0),
        "morning": [],
        "evening": [],
        "weekend": [],
        "carried": [],
        "redos": [],
        "dsa_backlog": 0,
    }
    result["streak"] = streaks(attempts, today)
    result["week_strip"] = _week_strip(start_date, today, week, by_date)
    if week == 0:
        result.update(done_count=0, total_count=0, week_progress={"done": 0, "total": 0})
        return result

    def item(task: PrepTask, badge: str | None = None) -> dict[str, Any]:
        return _task_item(task, done=task.id in done_today, badge=badge)

    def pending(task: PrepTask) -> bool:
        return task.id not in done_before

    shown: set[str] = set()

    # Redos due today or overdue, plus those cleared today so they stay ticked.
    redo_items: list[dict[str, Any]] = []
    seen_redo_tasks: set[str] = set()
    for redo in sorted(redos, key=lambda r: (r.due_date, r.id or 0)):
        if redo.due_date > today or redo.task_id in seen_redo_tasks:
            continue
        cleared_today = redo.done and redo.completed_on == today
        if redo.done and not cleared_today:
            continue
        seen_redo_tasks.add(redo.task_id)
        redo_items.append(
            _redo_item(redo, by_id.get(redo.task_id), done=cleared_today, badge="Redo")
        )
    result["redos"] = redo_items

    # Morning: DSA in order, oldest unfinished first; weeks 9-10 switch to NeetCode.
    leftover_dsa = [t for t in ordered if t.type == "dsa" and t.week <= week and pending(t)]
    if week >= 9:
        nc_id = neetcode_task_id(today)
        result["morning"].append(
            {
                "key": nc_id,
                "task_id": nc_id,
                "type": "dsa",
                "title": "1 unseen medium from NeetCode 150",
                "url": NEETCODE_URL,
                "pattern": None,
                "slot": "morning",
                "week": week,
                "target_minutes": 40,
                "stretch": False,
                "badge": "NeetCode",
                "done": nc_id in done_today,
                "redo_id": None,
                "due_date": None,
                "reason": None,
            }
        )
    else:
        for task in leftover_dsa[:MORNING_DSA_PER_DAY]:
            result["morning"].append(item(task))
            shown.add(task.id)
        result["dsa_backlog"] = max(len(leftover_dsa) - MORNING_DSA_PER_DAY, 0)

    # Evening, by phase of the program.
    if week == 1:
        evening = [t for t in ordered if t.type == "python" and t.day == weekday]
    elif week in (2, 3):
        evening = [t for t in ordered if t.type == "drill" and t.week <= week and pending(t)][:1]
    elif 4 <= week <= 6:
        evening = [
            t for t in ordered
            if t.type in ("lld", "hld") and t.week == week and t.day == weekday
        ]
    elif week in (7, 8):
        evening = [t for t in ordered if t.type == "hld" and t.week == week and t.day == weekday]
    else:
        evening = []
    for task in evening:
        result["evening"].append(item(task))
        shown.add(task.id)

    if week in (7, 8):
        due_drill_redo = any(
            by_id.get(r["task_id"]) and by_id[r["task_id"]].type == "drill" for r in redo_items
        )
        if not due_drill_redo:
            open_drill_redos = sorted(
                (
                    r for r in redos
                    if not r.done and r.task_id in by_id and by_id[r.task_id].type == "drill"
                ),
                key=lambda r: (r.due_date, r.id or 0),
            )
            if open_drill_redos:
                redo = open_drill_redos[0]
                result["evening"].append(
                    _redo_item(redo, by_id[redo.task_id], done=False, badge="Drill redo")
                )

    # Weekend: this week's project milestones.
    if weekday in ("Sat", "Sun"):
        for task in ordered:
            if task.type == "project" and task.week == week:
                result["weekend"].append(item(task))
                shown.add(task.id)

    # Carried over: anything whose slot has passed and was never finished.
    for task in ordered:
        if task.id in shown or task.week > week or not pending(task):
            continue
        when = scheduled_date(task, start_date)
        if task.type == "dsa":
            # Weeks 1-8 keep unfinished DSA in the morning queue instead.
            overdue = week >= 9
        elif task.type == "drill":
            overdue = week > 3
        elif task.type == "project":
            overdue = task.week < week
        else:
            overdue = when is not None and when < today
        if overdue:
            result["carried"].append(item(task, badge="Carried over"))

    today_items = result["redos"] + result["morning"] + result["evening"] + result["weekend"]
    result["done_count"] = sum(1 for i in today_items if i["done"])
    result["total_count"] = len(today_items)
    week_tasks = [t for t in tasks if t.week == week]
    result["week_progress"] = {
        "done": sum(1 for t in week_tasks if t.id in done_before or t.id in done_today),
        "total": len(week_tasks),
    }
    return result


def _week_strip(
    start_date: date, today: date, week: int, by_date: dict[date, set[str]]
) -> list[dict[str, Any]]:
    first = week_start(start_date, max(week, 1))
    strip = []
    for offset in range(7):
        day = first + timedelta(days=offset)
        count = len(by_date.get(day, set()))
        if count >= STREAK_MIN_TASKS:
            status = "done"
        elif count:
            status = "partial"
        elif day < today:
            status = "missed"
        elif day == today:
            status = "today"
        else:
            status = "upcoming"
        strip.append(
            {"date": day.isoformat(), "label": weekday_label(day), "status": status, "count": count}
        )
    return strip
