"""After-attempt tutor: reviews a logged attempt and answers follow-up questions.

It sees the task, the brief, the learner's own code and notes, and the authored
reference solution (so feedback is grounded), but never the career profile.
"""
from __future__ import annotations

from typing import Any

from app.models import PrepAttempt, PrepTask, PrepTutorMessage

REVIEW_INSTRUCTIONS = """You are a strict but encouraging interviewer-coach for Applied AI \
engineering roles. The learner has just finished and logged an attempt, so you may now \
discuss the ideal solution openly.

Review THEIR attempt in markdown with these sections:
### Verdict
One line.
### Your approach vs the ideal
What they did, the pattern that fits best, and the key insight they missed (if any).
### Complexity
Theirs vs optimal, time and space.
### Edge cases
The ones their code misses, quoting the line where it matters.
### Cleaner code
One concrete improvement, with a short snippet if useful. Do not rewrite their whole solution.
### Drill next
One specific thing to practise.

Judge the code they wrote, not the reference. If they wrote no code, say so and review \
their notes and approach instead. Under 350 words."""

FOLLOWUP_INSTRUCTIONS = """You are a patient Applied AI interview coach answering follow-up \
questions about one practice task the learner already attempted. Answer the question \
directly and concretely, in markdown. Prefer explaining the idea and walking through a small \
example; show code when it helps. Keep answers focused and under 300 words unless asked \
for more detail."""


def task_context(
    task: PrepTask | None, attempt: PrepAttempt, hints_revealed: int
) -> str:
    """Everything the tutor knows about the task and this attempt, as one block."""
    title = attempt.title or (task.title if task else attempt.task_id)
    lines = [
        f"TASK: {title}",
        f"Type: {task.type if task else 'dsa'}",
    ]
    if task and task.url:
        lines.append(f"Problem link: {task.url}")
    if task and task.pattern:
        lines.append(f"Pattern: {task.pattern}")
    if task and task.spec:
        lines.append(f"Spec: {task.spec}")
    if task and task.brief:
        lines += ["", "BRIEF:", task.brief.strip()]
    target = task.target_minutes if task else 40
    lines += [
        "",
        "THE ATTEMPT:",
        f"Time: {round(attempt.elapsed_minutes)} min (target {target} min)",
        f"Hint used: {'yes' if attempt.hint_used else 'no'}"
        + (f" ({hints_revealed} of the authored hints revealed)" if hints_revealed else ""),
        f"Solved: {attempt.solved}",
        f"Self-rating: {attempt.self_rating or 'not given'} / 5",
        f"Stated complexity: {attempt.complexity or 'not given'}",
        f"Notes: {attempt.notes or '(none)'}",
        "Code:",
        f"```python\n{attempt.code.strip() or '# (no code submitted)'}\n```",
    ]
    if task and task.solution:
        lines += [
            "",
            "REFERENCE SOLUTION (for your grounding; compare against it, do not just paste it):",
            task.solution.strip(),
        ]
    return "\n".join(lines)


def review_messages(
    task: PrepTask | None, attempt: PrepAttempt, hints_revealed: int
) -> list[dict[str, Any]]:
    return [
        {"role": "system", "content": REVIEW_INSTRUCTIONS},
        {"role": "user", "content": task_context(task, attempt, hints_revealed)},
    ]


def followup_messages(
    task: PrepTask | None,
    attempt: PrepAttempt,
    hints_revealed: int,
    history: list[PrepTutorMessage],
    question: str,
) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = [
        {
            "role": "system",
            "content": FOLLOWUP_INSTRUCTIONS
            + "\n\nContext for this conversation:\n\n"
            + task_context(task, attempt, hints_revealed),
        }
    ]
    for message in history[-12:]:
        messages.append({"role": message.role, "content": message.content})
    messages.append({"role": "user", "content": question})
    return messages


def offline_review(task: PrepTask | None, attempt: PrepAttempt) -> str:
    """Used when no AI provider is configured: honest summary plus the reference."""
    target = task.target_minutes if task else 40
    over = attempt.elapsed_minutes > target
    lines = [
        "### Verdict",
        f"Logged {round(attempt.elapsed_minutes)} min against a {target} min target"
        f"{' (over time)' if over else ''}, solved {attempt.solved}"
        f"{', with a hint' if attempt.hint_used else ''}.",
        "",
        "_The AI reviewer is not configured on this server, so this is the reference "
        "approach rather than a review of your code._",
    ]
    if task and task.solution:
        lines += ["", "### Ideal approach", task.solution.strip()]
    return "\n".join(lines)


OFFLINE_FOLLOWUP = (
    "The AI tutor is not configured on this server (no model API key), so it can't "
    "answer questions yet. The reference approach is shown in the review above."
)
