"""An AI interviewer for practising one task under interview conditions.

The interviewer sees the problem, the reference solution (never to be
revealed), the candidate's current code and the conversation so far. At the
end it writes a structured scorecard.
"""
from __future__ import annotations

from typing import Any

from app.models import PrepMockSession, PrepMockTurn, PrepTask

INTERVIEWER_INSTRUCTIONS = """You are a senior engineer running a live technical interview \
for an Applied AI / software engineering role at a top tech company or AI lab. The candidate \
is solving the problem below in a shared editor while talking to you.

How to behave:
- Let the candidate drive. Your replies are short: 1-4 sentences, plain text, no headings.
- Answer clarifying questions directly and consistently with the problem's constraints, \
but never suggest an approach, data structure, pattern or algorithm.
- Never write code for them and never reveal or paraphrase the reference solution.
- If they are stuck and explicitly ask for help, give the smallest possible nudge (a question, \
not an answer) and remember that it was a hint.
- Probe like a real interviewer: ask for time and space complexity, edge cases, why they chose \
something, and how they would test it. Point out a bug only by asking about an input that breaks it.
- Once they have a working solution, ask one or two follow-ups (constraints change, scale, \
trade-offs). For design problems, push on scale numbers, failure modes and trade-offs.
- Stay neutral and professional; do not praise excessively or tell them whether they will pass."""

SCORECARD_INSTRUCTIONS = """You were the interviewer in the interview transcript below. \
Write the scorecard as a JSON object with exactly these keys:
{"communication": 1-4, "problem_solving": 1-4, "coding": 1-4, "verification": 1-4,
 "signal": "strong_no" | "no" | "lean_no" | "lean_yes" | "yes" | "strong_yes",
 "summary": "2-3 sentences", "strengths": ["..."], "improvements": ["..."]}
Scores: 1 = poor, 2 = below the bar, 3 = at the bar, 4 = strong. "coding" covers \
correctness and quality of the final code (or of the design for design problems). \
"verification" covers testing, edge cases and complexity analysis. Judge the final code \
as well as the conversation. Hints given during the interview lower problem_solving. \
Give 2-4 strengths and 2-4 concrete improvements. Return only the JSON."""

SIGNALS = ("strong_no", "no", "lean_no", "lean_yes", "yes", "strong_yes")
SIGNAL_SCORES = {"strong_no": 1, "no": 2, "lean_no": 2, "lean_yes": 3, "yes": 4, "strong_yes": 5}
PASSING_SIGNALS = {"lean_yes", "yes", "strong_yes"}
DIMENSIONS = ("communication", "problem_solving", "coding", "verification")


def problem_text(task: PrepTask) -> str:
    return (task.statement or task.brief or task.spec or task.title).strip()


def opening_message(task: PrepTask) -> str:
    """Deterministic first line, so the interview starts instantly and offline."""
    if task.type in ("hld", "project"):
        return (
            f"Hi, thanks for joining. Today let's design: {task.title}. The scenario is on the "
            "left. Start by telling me what you would clarify about requirements and scale "
            "before drawing anything."
        )
    return (
        f"Hi, thanks for joining. Today's problem is {task.title}; the description is on the "
        "left. Take a moment to read it, then talk me through how you understand it and any "
        "questions you have before you start coding."
    )


def interviewer_messages(
    task: PrepTask,
    session: PrepMockSession,
    turns: list[PrepMockTurn],
    code: str,
    elapsed_minutes: float,
) -> list[dict[str, Any]]:
    context = [
        INTERVIEWER_INSTRUCTIONS,
        "",
        f"PROBLEM ({task.title}):",
        problem_text(task),
        "",
        "REFERENCE SOLUTION (private, for your judgement only; never reveal it):",
        (task.solution or "(none)").strip(),
        "",
        f"Time elapsed: {round(elapsed_minutes)} min of a {task.target_minutes} min slot.",
        "Candidate's current editor contents:",
        f"```\n{code.strip() or '(empty)'}\n```",
    ]
    messages: list[dict[str, Any]] = [{"role": "system", "content": "\n".join(context)}]
    for turn in turns[-30:]:
        role = "assistant" if turn.role == "interviewer" else "user"
        messages.append({"role": role, "content": turn.content})
    return messages


def transcript(turns: list[PrepMockTurn]) -> str:
    return "\n".join(
        f"{'Interviewer' if t.role == 'interviewer' else 'Candidate'}: {t.content}" for t in turns
    )


def scorecard_messages(
    task: PrepTask, turns: list[PrepMockTurn], code: str, elapsed_minutes: float
) -> list[dict[str, Any]]:
    body = "\n".join(
        [
            f"PROBLEM ({task.title}):",
            problem_text(task),
            "",
            "REFERENCE SOLUTION (for judging correctness):",
            (task.solution or "(none)").strip(),
            "",
            f"Time used: {round(elapsed_minutes)} min (target {task.target_minutes}).",
            "FINAL CODE / NOTES:",
            code.strip() or "(empty)",
            "",
            "TRANSCRIPT:",
            transcript(turns) or "(no conversation)",
        ]
    )
    return [
        {"role": "system", "content": SCORECARD_INSTRUCTIONS},
        {"role": "user", "content": body},
    ]


def normalize_scorecard(raw: dict[str, Any] | None) -> dict[str, Any] | None:
    """Clamp a model's scorecard into the expected shape; None if unusable."""
    if not isinstance(raw, dict):
        return None
    card: dict[str, Any] = {}
    for key in DIMENSIONS:
        try:
            card[key] = max(1, min(4, int(raw.get(key))))
        except (TypeError, ValueError):
            return None
    signal = str(raw.get("signal", "")).strip().lower().replace(" ", "_")
    if signal not in SIGNALS:
        return None
    card["signal"] = signal
    card["summary"] = str(raw.get("summary", "")).strip()[:1200]
    for key in ("strengths", "improvements"):
        items = raw.get(key) or []
        card[key] = [str(i).strip()[:300] for i in items if str(i).strip()][:5]
    card["score"] = SIGNAL_SCORES[signal]
    return card


def offline_scorecard(turns: list[PrepMockTurn], code: str) -> dict[str, Any]:
    """When no model is configured: an honest placeholder, not a judgement."""
    spoke = sum(1 for t in turns if t.role == "candidate")
    return {
        "communication": 2 if spoke < 3 else 3,
        "problem_solving": 2,
        "coding": 3 if code.strip() else 1,
        "verification": 2,
        "signal": "lean_no",
        "score": SIGNAL_SCORES["lean_no"],
        "summary": "The AI interviewer is not configured on this server, so this is a placeholder "
        "based only on how much you said and whether you wrote code.",
        "strengths": ["You completed a timed session."] if code.strip() else [],
        "improvements": ["Narrate your approach out loud throughout the session."],
        "offline": True,
    }


def mock_kind(task: PrepTask | None) -> str:
    """Which round type a session counts as in the mock log."""
    if task is None or task.type == "dsa":
        return "dsa"
    if task.type in ("hld", "project"):
        return "system_design"
    if task.type == "lld":
        return "lld"
    return "practical"
