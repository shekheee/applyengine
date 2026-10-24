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
EXTRA_SLOT = "extra"
EXTRA_MIX = (("easy", 1), ("medium", 2))
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
        "difficulty": task.difficulty,
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
    extras = [t for t in tasks if t.slot == EXTRA_SLOT]
    tasks = [t for t in tasks if t.slot != EXTRA_SLOT]
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
        "extra": [],
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

    # Optional practice: shown daily, never counted in today's or the week's totals.
    result["extra"] = [
        _task_item(task, done=task.id in done_today, badge=(task.difficulty or "").title() or None)
        for task in pick_extras(extras, start_date, today, week, done_before)
    ]

    today_items = result["redos"] + result["morning"] + result["evening"] + result["weekend"]
    result["done_count"] = sum(1 for i in today_items if i["done"])
    result["total_count"] = len(today_items)
    week_tasks = [t for t in tasks if t.week == week]
    result["week_progress"] = {
        "done": sum(1 for t in week_tasks if t.id in done_before or t.id in done_today),
        "total": len(week_tasks),
    }
    return result


def pick_extras(
    extras: list[PrepTask],
    start_date: date,
    today: date,
    week: int,
    done_before: set[str],
) -> list[PrepTask]:
    """One easy and two medium problems on this week's pattern, not done before today.

    The pick rotates daily (skip one and tomorrow shows others) but is stable
    within a day. When this week's pool runs low, earlier weeks fill in; in
    weeks 9-10, after the pattern weeks, the whole bank is in play.
    """
    if week == 0 or not extras:
        return []
    last_bank_week = max(t.week for t in extras)
    if week > last_bank_week:
        preference = sorted({t.week for t in extras})
    else:
        preference = [week] + list(range(week - 1, 0, -1))
    day_index = (today - start_date).days
    picked: list[PrepTask] = []
    for difficulty, count in EXTRA_MIX:
        pool = [t for t in extras if t.difficulty == difficulty and t.id not in done_before]
        ranked = sorted(
            (t for t in pool if t.week in preference),
            key=lambda t: (preference.index(t.week), t.order, t.id),
        )
        if week > last_bank_week:
            lead = sorted(ranked, key=lambda t: (t.order, t.week, t.id))
        else:
            # This week's remaining problems; once fewer than needed, take the ranked top.
            lead = [t for t in ranked if t.week == week]
            if len(lead) < count:
                lead = ranked[:count]
        if len(lead) > count:
            offset = day_index % len(lead)
            lead = lead[offset:] + lead[:offset]
        picked += lead[:count]
    return picked


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


def build_plan(
    tasks: list[PrepTask],
    start_date: date | None,
    today: date,
    attempts: list[PrepAttempt],
    redos: list[PrepRedo],
) -> dict[str, Any]:
    """Every week's tasks with the user's status on each.

    Status is "redo" while redos are queued, "done" once attempted with none
    left, and "todo" otherwise. NeetCode attempts from weeks 9-10 are listed
    under the week they were logged in.
    """
    by_task: dict[str, list[PrepAttempt]] = defaultdict(list)
    for attempt in sorted(attempts, key=lambda a: (a.date, a.id or 0)):
        by_task[attempt.task_id].append(attempt)
    open_redos: dict[str, list[PrepRedo]] = defaultdict(list)
    for redo in redos:
        if not redo.done:
            open_redos[redo.task_id].append(redo)

    def row(task_id: str, base: dict[str, Any]) -> dict[str, Any]:
        logged = by_task.get(task_id, [])
        pending = sorted(open_redos.get(task_id, []), key=lambda r: r.due_date)
        last = logged[-1] if logged else None
        status = "redo" if pending else "done" if logged else "todo"
        return {
            **base,
            "status": status,
            "attempts": len(logged),
            "last_date": last.date.isoformat() if last else None,
            "last_minutes": round(last.elapsed_minutes) if last else None,
            "last_hint": last.hint_used if last else None,
            "last_solved": last.solved if last else None,
            "next_redo": pending[0].due_date.isoformat() if pending else None,
        }

    tasks = [t for t in tasks if t.slot != EXTRA_SLOT]
    weeks: dict[int, list[dict[str, Any]]] = {w: [] for w in range(1, PROGRAM_WEEKS + 1)}
    slot_rank = {"morning": 0, "evening": 1, "weekend": 2}
    for task in sorted(tasks, key=lambda t: (t.week, slot_rank.get(t.slot, 3), t.order, t.id)):
        weeks.setdefault(task.week, []).append(
            row(
                task.id,
                {
                    "task_id": task.id,
                    "type": task.type,
                    "title": task.title,
                    "url": task.url,
                    "pattern": task.pattern,
                    "day": task.day,
                    "slot": task.slot,
                    "target_minutes": task.target_minutes,
                    "stretch": task.stretch,
                },
            )
        )
    if start_date:
        seen: set[str] = set()
        for attempt in attempts:
            if not attempt.task_id.startswith("nc-") or attempt.task_id in seen:
                continue
            seen.add(attempt.task_id)
            week = program_week(start_date, attempt.date) or PROGRAM_WEEKS
            weeks.setdefault(week, []).append(
                row(
                    attempt.task_id,
                    {
                        "task_id": attempt.task_id,
                        "type": "dsa",
                        "title": attempt.title or "NeetCode 150 medium",
                        "url": NEETCODE_URL,
                        "pattern": "NeetCode 150",
                        "day": None,
                        "slot": "morning",
                        "target_minutes": 40,
                        "stretch": False,
                    },
                )
            )

    week_rows = [
        {
            "week": week,
            "start_date": week_start(start_date, week).isoformat() if start_date else None,
            "tasks": rows,
            "done": sum(1 for r in rows if r["status"] != "todo"),
        }
        for week, rows in sorted(weeks.items())
    ]
    return {
        "current_week": program_week(start_date, today) if start_date else 0,
        "weeks": week_rows,
    }
