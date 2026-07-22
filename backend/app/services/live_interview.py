from __future__ import annotations

import json
import logging
import re
from collections.abc import AsyncIterator
from typing import Any

from app import prompts
from app.llm.factory import build_coach_provider
from app.models import InterviewSession, InterviewTurn, Job, Profile
from app.services.interview_practice import generate_summary
from app.services.ml_interview_curriculum import (
    curriculum_prompt_block,
    normalize_curriculum_topic,
)
from app.services.profession import focus_guide, normalize_focus, profession_context
from app.services.serialize import job_to_text, profile_to_text

logger = logging.getLogger(__name__)

META_DELIMITER = "|||META|||"
MAX_FOLLOWUPS_PER_QUESTION = 1


def _chain(model_id: str | None):
    chain = build_coach_provider(model_id)
    chain.reset()
    return chain


def planned_questions_block(session: InterviewSession) -> str:
    lines: list[str] = []
    for i, q in enumerate(session.questions or []):
        cat = q.get("category", "")
        tip = q.get("tip", "")
        lines.append(f"{i + 1}. [{cat}] {q.get('text', '')}")
        if tip:
            lines.append(f"   (Strong answer covers: {tip})")
    return "\n".join(lines) if lines else "(none)"


def conversation_block(turns: list[InterviewTurn]) -> str:
    lines: list[str] = []
    for t in turns:
        if t.role == "interviewer":
            lines.append(f"Interviewer: {t.content.strip()}")
        elif t.role == "candidate":
            lines.append(f"Candidate: {t.content.strip()}")
    return "\n".join(lines)


def followups_at_index(session: InterviewSession, index: int) -> int:
    state = session.live_state or {}
    raw = state.get("followups_at_index") or {}
    return int(raw.get(str(index), 0))


def parse_interviewer_response(full_text: str) -> tuple[str, dict[str, Any]]:
    text = (full_text or "").strip()
    if META_DELIMITER in text:
        speech, _, meta_raw = text.partition(META_DELIMITER)
        speech = speech.strip()
        meta_raw = meta_raw.strip()
        try:
            meta = json.loads(meta_raw)
            if not isinstance(meta, dict):
                meta = {}
        except json.JSONDecodeError:
            meta = _fallback_meta_from_text(meta_raw)
    else:
        speech = text
        meta = {"action": "next_question", "question_index": 0, "end_interview": False}
    meta.setdefault("action", "next_question")
    meta.setdefault("question_index", 0)
    meta.setdefault("end_interview", False)
    return speech, meta


def _fallback_meta_from_text(raw: str) -> dict[str, Any]:
    end = "closing" in raw.lower() or "end_interview" in raw.lower()
    action = "closing" if end else "next_question"
    idx_match = re.search(r'"question_index"\s*:\s*(\d+)', raw)
    idx = int(idx_match.group(1)) if idx_match else 0
    return {"action": action, "question_index": idx, "end_interview": end}


async def stream_interviewer_turn_async(
    session: InterviewSession,
    profile: Profile | None,
    job: Job | None,
    turns: list[InterviewTurn],
    *,
    candidate_answer: str | None = None,
    model_id: str | None = None,
) -> AsyncIterator[str]:
    focus = normalize_focus(session.focus)
    curriculum_topic = normalize_curriculum_topic(getattr(session, "curriculum_topic", "") or "")
    prof_ctx = profession_context(profile, job)
    curriculum_text = curriculum_prompt_block(curriculum_topic) if curriculum_topic else ""
    idx = session.current_index
    followups = followups_at_index(session, idx)

    user_msg = prompts.interview_live_turn_user(
        profile_to_text(profile) if profile else "",
        job_to_text(job) if job else "",
        focus,
        session.difficulty,
        planned_questions_block(session),
        conversation_block(turns),
        profession_text=prof_ctx,
        focus_guide_text=focus_guide(focus),
        curriculum_text=curriculum_text,
        candidate_answer=candidate_answer,
        current_index=idx,
        followups_at_index=str(followups),
    )

    chain = _chain(model_id)
    messages = [
        {"role": "system", "content": prompts.INTERVIEW_LIVE_SYSTEM},
        {"role": "user", "content": user_msg},
    ]
    async for token in chain.chat_stream_async(messages):
        yield token
    logger.info("Live interviewer turn served by %s/%s", chain.last_served, chain.last_model)


def apply_live_meta(session: InterviewSession, meta: dict[str, Any]) -> None:
    action = str(meta.get("action", "next_question"))
    idx = int(meta.get("question_index", session.current_index))
    end = bool(meta.get("end_interview"))

    state = dict(session.live_state or {})
    followups = dict(state.get("followups_at_index") or {})
    themes = list(state.get("themes_covered") or [])

    if action == "followup":
        key = str(session.current_index)
        followups[key] = int(followups.get(key, 0)) + 1
    elif action in ("next_question", "opening"):
        if session.current_index not in themes:
            themes.append(session.current_index)
        questions = session.questions or []
        if action == "next_question" and session.current_index + 1 < len(questions):
            session.current_index += 1
        elif idx != session.current_index and 0 <= idx < len(questions):
            session.current_index = idx
    elif action == "closing" or end:
        if session.current_index not in themes:
            themes.append(session.current_index)

    state["followups_at_index"] = followups
    state["themes_covered"] = themes
    state["turn_count"] = int(state.get("turn_count", 0)) + 1
    session.live_state = state


def build_live_transcript(session: InterviewSession, turns: list[InterviewTurn]) -> str:
    """Format live conversation for summary evaluation."""
    lines: list[str] = [
        f"Mode: live interview | Focus: {session.focus} | Difficulty: {session.difficulty}",
    ]
    if session.curriculum_topic:
        lines.append(f"Curriculum topic: {session.curriculum_topic}")
    lines.append("")
    planned = session.questions or []
    if planned:
        lines.append("Planned themes:")
        for i, q in enumerate(planned):
            lines.append(f"  Q{i + 1}: {q.get('text', '')}")
        lines.append("")
    for t in turns:
        if t.role == "interviewer":
            action = (t.scores or {}).get("action", "")
            suffix = f" [{action}]" if action else ""
            lines.append(f"Interviewer{suffix}: {t.content.strip()}")
        elif t.role == "candidate":
            lines.append(f"Candidate: {t.content.strip()}")
    return "\n".join(lines)


def generate_live_summary(
    session: InterviewSession,
    turns: list[InterviewTurn],
    profile: Profile | None,
    job: Job | None,
    *,
    model_id: str | None = None,
) -> dict[str, Any]:
    chain = build_coach_provider(model_id)
    chain.reset()
    prof_ctx = profession_context(profile, job)
    curriculum_topic = normalize_curriculum_topic(getattr(session, "curriculum_topic", "") or "")
    curriculum_text = curriculum_prompt_block(curriculum_topic) if curriculum_topic else ""
    transcript = build_live_transcript(session, turns)
    data = chain.chat_json(
        prompts.INTERVIEW_SUMMARY_SYSTEM,
        prompts.interview_summary_user(
            profile_to_text(profile) if profile else "",
            job_to_text(job) if job else "",
            transcript,
            profession_text=prof_ctx,
            curriculum_text=curriculum_text,
        ),
    )
    if not isinstance(data, dict):
        data = {}
    logger.info("Live interview summary served by %s/%s", chain.last_served, chain.last_model)
    return data


def should_end_live_interview(session: InterviewSession, meta: dict[str, Any]) -> bool:
    if meta.get("end_interview"):
        return True
    if meta.get("action") == "closing":
        return True
    state = session.live_state or {}
    themes = state.get("themes_covered") or []
    questions = session.questions or []
    turn_count = int(state.get("turn_count", 0))
    if questions and len(themes) >= len(questions) and turn_count >= len(questions):
        return True
    if turn_count >= max(len(questions) * 2, 12):
        return True
    return False
