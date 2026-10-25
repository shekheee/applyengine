"""Readiness checkpoints: the plan's exit tests as timed, pass/fail runs.

Run checkpoints pick a task (unseen where possible), run with no hints under
a hard time limit, and are graded by a rule. Computed checkpoints (story bank,
mock count) are read straight from the learner's data.
"""
from __future__ import annotations

from typing import Any

from app.models import PrepAttempt, PrepMock, PrepMockSession, PrepStory, PrepTask
from app.services.prep_mock_interview import PASSING_SIGNALS

COMPETENCIES = (
    "ownership",
    "impact & results",
    "ambiguity",
    "conflict & disagreement",
    "failure & learning",
    "leadership & influence",
    "customer focus",
    "technical depth",
    "speed & bias for action",
    "collaboration",
    "mission & AI safety",
    "raising the bar",
)
MIN_STORIES = 8
MIN_QUESTIONS = 20
MIN_MOCKS = 6
MOCK_GRACE_MINUTES = 5

TRACKS = {
    "faang": "FAANG coding",
    "lab": "Lab practical",
    "design": "Design",
    "behavioral": "Behavioural",
}

# rule: clean = solved, no hint, within limit; tests = every test passed;
# levels3 = challenge level 3 passed; mock = AI interviewer signal of lean_yes or better.
CHECKPOINTS: list[dict[str, Any]] = [
    {
        "id": "cp-unseen-medium",
        "week": 3,
        "tracks": ["faang"],
        "title": "Unseen medium in 30 minutes",
        "criteria": "Solve a medium you have never attempted, in 30 minutes, with no hints.",
        "limit": 30,
        "rule": "clean",
        "pick": {"type": "dsa", "difficulty": "medium"},
    },
    {
        "id": "cp-runner",
        "week": 3,
        "tracks": ["lab"],
        "title": "Concurrent LLM runner in 45 minutes",
        "criteria": "Pass every test of drill 4.4 from the starter in 45 minutes, unassisted.",
        "limit": 45,
        "rule": "tests",
        "task_id": "drill-4.4",
    },
    {
        "id": "cp-eval-harness",
        "week": 6,
        "tracks": ["design", "lab"],
        "title": "Eval harness LLD in 60 minutes",
        "criteria": "Pass every test of LLD 5.4 (evaluation harness) in 60 minutes, unassisted.",
        "limit": 60,
        "rule": "tests",
        "task_id": "lld-5.4",
    },
    {
        "id": "cp-rag-design",
        "week": 6,
        "tracks": ["design", "lab"],
        "title": "RAG system design, out loud, in 45 minutes",
        "criteria": "Design the support copilot (HLD 6.1) with the AI interviewer and get a "
        "lean-yes or better.",
        "limit": 45,
        "rule": "mock",
        "task_id": "hld-6.1",
    },
    {
        "id": "cp-unseen-hard",
        "week": 8,
        "tracks": ["faang"],
        "title": "Unseen hard in 45 minutes",
        "criteria": "Solve a hard you have never attempted, in 45 minutes, with no hints.",
        "limit": 45,
        "rule": "clean",
        "pick": {"type": "dsa", "difficulty": "hard"},
    },
    {
        "id": "cp-challenge",
        "week": 8,
        "tracks": ["lab"],
        "title": "Multi-level challenge to level 3 in 60 minutes",
        "criteria": "Reach and pass level 3 of an unseen challenge within 60 minutes, no hints.",
        "limit": 60,
        "rule": "levels3",
        "pick": {"type": "challenge"},
    },
    {
        "id": "cp-classic-design",
        "week": 9,
        "tracks": ["faang", "design"],
        "title": "Classic system design mock",
        "criteria": "Run an unseen classic system design with the AI interviewer and get a "
        "lean-yes or better.",
        "limit": 45,
        "rule": "mock",
        "pick": {"type": "hld", "pattern": "Classic system design"},
    },
    {
        "id": "cp-stories",
        "week": 9,
        "tracks": ["behavioral"],
        "title": "Story bank ready",
        "criteria": f"{MIN_STORIES}+ stories, every competency covered, and {MIN_QUESTIONS} of the "
        "25 bank questions answered.",
        "rule": "computed",
    },
    {
        "id": "cp-mocks",
        "week": 9,
        "tracks": ["behavioral", "faang", "lab"],
        "title": f"{MIN_MOCKS}+ mock interviews",
        "criteria": f"Log at least {MIN_MOCKS} mock interviews (AI or human) across round types.",
        "rule": "computed",
    },
]
BY_ID = {c["id"]: c for c in CHECKPOINTS}


def pick_task(
    checkpoint: dict[str, Any], tasks: list[PrepTask], attempts: list[PrepAttempt], week: int
) -> PrepTask | None:
    """The task for a run: fixed, or the first unseen task matching the filter
    (preferring weeks already reached), else the least recently attempted one."""
    by_id = {t.id: t for t in tasks}
    if checkpoint.get("task_id"):
        return by_id.get(checkpoint["task_id"])
    rules = checkpoint.get("pick") or {}
    pool = [
        t
        for t in tasks
        if t.type == rules.get("type", t.type)
        and (rules.get("difficulty") is None or t.difficulty == rules["difficulty"])
        and (rules.get("pattern") is None or t.pattern == rules["pattern"])
    ]
    if not pool:
        return None
    last_seen: dict[str, Any] = {}
    for attempt in attempts:
        if attempt.task_id in by_id:
            last_seen[attempt.task_id] = max(last_seen.get(attempt.task_id, attempt.date), attempt.date)
    unseen = [t for t in pool if t.id not in last_seen]
    if unseen:
        return sorted(unseen, key=lambda t: (t.week > max(week, 1), t.week, t.order, t.id))[0]
    return sorted(pool, key=lambda t: (last_seen[t.id], t.id))[0]


def evaluate_run(
    checkpoint: dict[str, Any],
    attempt: PrepAttempt | None,
    mock: PrepMockSession | None,
    elapsed_minutes: float,
    tests_passed: int | None,
    tests_total: int | None,
    levels_passed: int | None,
) -> tuple[bool, list[str]]:
    """Whether a run passes, with the reasons it did not."""
    limit = checkpoint["limit"]
    rule = checkpoint["rule"]
    reasons: list[str] = []
    if rule == "mock":
        if mock is None or not mock.scorecard:
            return False, ["the mock interview was not finished"]
        signal = mock.scorecard.get("signal")
        if signal not in PASSING_SIGNALS:
            reasons.append(f"interviewer signal was {str(signal).replace('_', ' ')}")
        if elapsed_minutes > limit + MOCK_GRACE_MINUTES:
            reasons.append(f"took {round(elapsed_minutes)} min (limit {limit})")
        return not reasons, reasons

    if attempt is None:
        return False, ["no attempt was logged"]
    if attempt.hint_used:
        reasons.append("a hint was used")
    if attempt.elapsed_minutes > limit:
        reasons.append(f"took {round(attempt.elapsed_minutes)} min (limit {limit})")
    if rule == "clean" and attempt.solved != "yes":
        reasons.append(f"solved: {attempt.solved}")
    if rule == "tests" and not (tests_total and tests_passed == tests_total):
        reasons.append(f"tests passed: {tests_passed or 0}/{tests_total or '?'} (run Submit)")
    if rule == "levels3" and (levels_passed or 0) < 3:
        reasons.append(f"passed level {levels_passed or 0} of 3")
    return not reasons, reasons


def computed_status(
    checkpoint_id: str, stories: list[PrepStory], mocks: list[PrepMock]
) -> tuple[bool, str]:
    if checkpoint_id == "cp-stories":
        covered = {tag for s in stories for tag in s.tags} & set(COMPETENCIES)
        questions = {q for s in stories for q in (s.questions or [])}
        done = (
            len(stories) >= MIN_STORIES
            and len(covered) == len(COMPETENCIES)
            and len(questions) >= MIN_QUESTIONS
        )
        return done, (
            f"{len(stories)}/{MIN_STORIES} stories · {len(covered)}/{len(COMPETENCIES)} "
            f"competencies · {len(questions)}/{MIN_QUESTIONS} questions"
        )
    if checkpoint_id == "cp-mocks":
        return len(mocks) >= MIN_MOCKS, f"{len(mocks)}/{MIN_MOCKS} mocks logged"
    return False, ""


def readiness(statuses: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Per-track roll-up: how many of its checkpoints have been passed."""
    rows = []
    for key, label in TRACKS.items():
        mine = [s for s in statuses if key in s["tracks"]]
        passed = sum(1 for s in mine if s["status"] == "passed")
        rows.append(
            {
                "track": key,
                "label": label,
                "passed": passed,
                "total": len(mine),
                "ready": bool(mine) and passed == len(mine),
            }
        )
    return rows
