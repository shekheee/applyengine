"""Behavioural story critique: an AI review when a model is configured, rules otherwise."""
from __future__ import annotations

import re
from typing import Any

from app.models import PrepStory

CRITIQUE_INSTRUCTIONS = """You are a hiring manager coaching a candidate for Applied AI and \
software engineering interviews at large tech companies and AI labs. Critique ONE \
behavioural story written in STAR form.

Reply in markdown with these sections:
### Verdict
One line: would this land in an interview, and why.
### STAR check
For each of Situation, Task, Action, Result: one line on what works or is missing.
### Make it stronger
2-4 concrete edits: sharper metrics, more "I" than "we", cut context, show judgement \
or trade-offs, what changed because of you.
### Competencies it shows
Which of the tagged competencies it genuinely demonstrates, and any it could also answer.
### Follow-up questions to expect
3 probing questions an interviewer would ask next.

Be direct and specific to their text. Under 300 words."""


def story_text(story: PrepStory) -> str:
    parts = [
        f"TITLE: {story.title}",
        f"TAGS: {', '.join(story.tags) or '(none)'}",
        f"TARGET COMPANIES: {', '.join(story.companies) or '(none)'}",
        f"SITUATION: {story.situation or '(empty)'}",
        f"TASK: {story.task or '(empty)'}",
        f"ACTION: {story.action or '(empty)'}",
        f"RESULT: {story.result or '(empty)'}",
    ]
    return "\n".join(parts)


def critique_messages(story: PrepStory) -> list[dict[str, Any]]:
    return [
        {"role": "system", "content": CRITIQUE_INSTRUCTIONS},
        {"role": "user", "content": story_text(story)},
    ]


def rule_based_critique(story: PrepStory) -> str:
    """Checks that need no model: missing STAR parts, numbers, ownership, length."""
    notes: list[str] = []
    for name in ("situation", "task", "action", "result"):
        if not getattr(story, name).strip():
            notes.append(f"- **{name.title()}** is empty.")
    if story.result and not re.search(r"\d", story.result):
        notes.append("- The result has no number. Add a metric: %, time saved, users, $.")
    action = story.action.lower()
    we = len(re.findall(r"\bwe\b", action))
    i = len(re.findall(r"\bi\b", action))
    if we > i:
        notes.append(f'- The action says "we" {we}x and "I" {i}x. Say what *you* did.')
    words = len(" ".join([story.situation, story.task, story.action, story.result]).split())
    if words > 400:
        notes.append(f"- {words} words is long. Aim for about 2 minutes spoken (250-350 words).")
    if len(story.situation.split()) > len(story.action.split()):
        notes.append("- More words on the situation than the action. Spend most time on what you did.")
    if not story.tags:
        notes.append("- Tag the competencies it shows so you can find it in an interview.")
    body = "\n".join(notes) or "- The structure looks complete."
    return (
        "### Quick check\n"
        "_The AI reviewer is not configured on this server, so these are rule-based checks._\n\n"
        f"{body}"
    )
