from __future__ import annotations

import json
import logging
import re
from time import perf_counter
from collections.abc import AsyncIterator
from typing import Any

from app import prompts
from app.llm.factory import build_coach_provider
from app.models import InterviewSession, InterviewTurn, Job, Profile
from app.services.interview_practice import generate_summary, routing_metadata
from app.services.ml_interview_curriculum import (
    curriculum_prompt_block,
    normalize_curriculum_topic,
)
from app.services.profession import focus_guide, normalize_focus, profession_context
from app.services.serialize import job_to_text, profile_to_text

logger = logging.getLogger(__name__)

META_DELIMITER = "|||META|||"
MAX_FOLLOWUPS_PER_QUESTION = 1
MAX_PROFILE_CONTEXT_CHARS = 4_500
MAX_JOB_CONTEXT_CHARS = 4_000
MAX_CONVERSATION_CONTEXT_CHARS = 4_000
MAX_LIVE_OUTPUT_TOKENS = 384
LIVE_FIRST_TOKEN_TIMEOUT_SECONDS = 5.0

PERSONA_GUIDES = {
    "hiring_manager": "Warm, commercially aware hiring manager. Test ownership, judgement, collaboration, and measurable impact.",
    "recruiter": "Concise recruiter screen. Test motivation, role fit, communication, availability themes, and credible career narrative.",
    "technical_panel": "Evidence-focused technical panel. Test depth, trade-offs, failure modes, decisions, and the candidate's exact contribution.",
    "skeptical_stakeholder": "Respectfully sceptical senior stakeholder. Challenge assumptions, influence, risk management, and unsupported impact claims.",
    "change_leader": "Senior change-management leader. Test adoption strategy, sponsorship, resistance, communications, benefits realisation, and human impact.",
}


def _chain(model_id: str | None):
    # A spoken interviewer turn is short. Low reasoning avoids spending live
    # conversation time on unnecessary hidden work.
    chain = build_coach_provider(model_id, reasoning_effort="low")
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


def interview_stage(session: InterviewSession, turns: list[InterviewTurn]) -> str:
    state = session.live_state or {}
    stored = str(state.get("stage", ""))
    if stored in (
        "introduction",
        "warmup",
        "competency",
        "challenge",
        "candidate_questions",
        "closing",
    ):
        return stored
    interviewer_turns = [turn for turn in turns if turn.role == "interviewer"]
    answers = [
        turn
        for turn in turns
        if turn.role == "candidate"
        and (turn.scores or {}).get("candidate_intent", "answer") == "answer"
    ]
    if not interviewer_turns:
        return "introduction"
    if not answers:
        return "warmup"
    questions = session.questions or []
    if questions and session.current_index >= len(questions) - 1:
        return "challenge"
    return "competency"


def behavior_context(session: InterviewSession, turns: list[InterviewTurn]) -> str:
    state = session.live_state or {}
    mode = str(state.get("behavior_mode", "simulation"))
    persona = str(state.get("interviewer_persona", "hiring_manager"))
    stage = interview_stage(session, turns)
    recent_signal = ""
    for turn in reversed(turns):
        if turn.role == "interviewer" and (turn.scores or {}).get("answer_signal"):
            recent_signal = str((turn.scores or {}).get("answer_signal"))
            break
    evidence_gaps = [str(item) for item in (state.get("evidence_gaps") or []) if item]
    questions = session.questions or []
    final_theme = bool(questions) and session.current_index >= len(questions) - 1
    return (
        f"BEHAVIOUR MODE: {mode}\n"
        f"PERSONA: {persona} — {PERSONA_GUIDES.get(persona, PERSONA_GUIDES['hiring_manager'])}\n"
        f"CURRENT STAGE: {stage}\n"
        f"MOST RECENT ANSWER SIGNAL: {recent_signal or '(none yet)'}\n"
        f"UNRESOLVED EVIDENCE GAPS: {evidence_gaps[-3:] or '(none)'}\n"
        f"CANDIDATE-QUESTIONS STAGE ALREADY ASKED: {bool(state.get('candidate_questions_asked'))}\n"
        f"CURRENT THEME IS FINAL PLANNED THEME: {final_theme}\n"
        "Follow the stage and mode policies exactly. Keep the spoken turn natural and brief. "
        "If useful, retest one unresolved gap later using different wording; do not repeat the same question. "
        "After the final theme and any one justified follow-up, ask for the candidate's questions before closing."
    )


def _bounded_context(value: str, limit: int) -> str:
    """Keep live-turn prompts responsive without losing the most useful context."""
    text = (value or "").strip()
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "\n[Context shortened for live response speed]"


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
    routing_out: dict[str, Any] | None = None,
    candidate_intent: str = "answer",
) -> AsyncIterator[str]:
    focus = normalize_focus(session.focus)
    curriculum_topic = normalize_curriculum_topic(getattr(session, "curriculum_topic", "") or "")
    prof_ctx = profession_context(profile, job)
    curriculum_text = curriculum_prompt_block(curriculum_topic) if curriculum_topic else ""
    idx = session.current_index
    followups = followups_at_index(session, idx)

    user_msg = prompts.interview_live_turn_user(
        _bounded_context(profile_to_text(profile) if profile else "", MAX_PROFILE_CONTEXT_CHARS),
        _bounded_context(job_to_text(job) if job else "", MAX_JOB_CONTEXT_CHARS),
        focus,
        session.difficulty,
        planned_questions_block(session),
        _bounded_context(conversation_block(turns[-8:]), MAX_CONVERSATION_CONTEXT_CHARS),
        profession_text=prof_ctx,
        focus_guide_text=focus_guide(focus),
        curriculum_text=curriculum_text,
        candidate_answer=candidate_answer,
        current_index=idx,
        followups_at_index=str(followups),
        behavior_context=behavior_context(session, turns),
        candidate_intent=candidate_intent,
    )

    chain = _chain(model_id)
    messages = [
        {"role": "system", "content": prompts.INTERVIEW_LIVE_SYSTEM},
        {"role": "user", "content": user_msg},
    ]
    started = perf_counter()
    first_token_ms: int | None = None
    async for token in chain.chat_stream_async(
        messages,
        max_tokens=MAX_LIVE_OUTPUT_TOKENS,
        first_token_timeout=LIVE_FIRST_TOKEN_TIMEOUT_SECONDS,
    ):
        if first_token_ms is None:
            first_token_ms = round((perf_counter() - started) * 1000)
        yield token
    if routing_out is not None:
        routing_out.update(
            routing_metadata(chain),
            first_token_ms=first_token_ms,
            generation_ms=round((perf_counter() - started) * 1000),
        )
    logger.info(
        "Live interviewer turn served by %s/%s (first_token_ms=%s total_ms=%s)",
        chain.last_served,
        chain.last_model,
        first_token_ms,
        round((perf_counter() - started) * 1000),
    )


def govern_live_meta(
    session: InterviewSession,
    meta: dict[str, Any],
    *,
    candidate_answer: str | None,
    candidate_intent: str,
) -> dict[str, Any]:
    """Keep model-generated language inside a predictable interview flow."""
    governed = dict(meta or {})
    state = session.live_state or {}
    questions = session.questions or []
    action = str(governed.get("action", "next_question"))

    governed["question_index"] = session.current_index
    governed["end_interview"] = False
    if candidate_intent == "clarification":
        governed.update(action="clarification", stage=state.get("stage", "competency"))
        return governed

    if state.get("candidate_questions_asked") and candidate_answer:
        governed.update(action="closing", stage="closing", end_interview=True)
        return governed

    is_last_theme = bool(questions) and session.current_index >= len(questions) - 1
    if candidate_answer and is_last_theme and action in ("next_question", "closing"):
        governed.update(action="candidate_questions", stage="candidate_questions")
        return governed

    if governed.get("action") == "closing" and not state.get("candidate_questions_asked"):
        governed.update(action="candidate_questions", stage="candidate_questions")
        return governed

    governed.setdefault(
        "stage",
        str(
            state.get("stage")
            or ("introduction" if not candidate_answer else "competency")
        ),
    )
    return governed


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
        state["stage"] = "challenge"
    elif action == "clarification":
        state["stage"] = str(state.get("stage", "competency"))
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
        state["stage"] = "closing"
    elif action == "candidate_questions":
        if session.current_index not in themes:
            themes.append(session.current_index)
        state["candidate_questions_asked"] = True
        state["stage"] = "candidate_questions"

    state["followups_at_index"] = followups
    state["themes_covered"] = themes
    state["turn_count"] = int(state.get("turn_count", 0)) + 1
    signal = str(meta.get("answer_signal", ""))
    evidence_gap = str(meta.get("evidence_gap", "")).strip()
    gaps = list(state.get("evidence_gaps") or [])
    if signal in ("thin", "unclear") and evidence_gap and evidence_gap not in gaps:
        gaps.append(evidence_gap)
    state["evidence_gaps"] = gaps[-6:]
    if meta.get("stage"):
        state["stage"] = str(meta["stage"])
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
            signal = (t.scores or {}).get("answer_signal", "")
            suffix_parts = [str(value) for value in (action, signal) if value]
            suffix = f" [{' | '.join(suffix_parts)}]" if suffix_parts else ""
            lines.append(f"Interviewer{suffix}: {t.content.strip()}")
            evidence_gap = (t.scores or {}).get("evidence_gap")
            if evidence_gap:
                lines.append(f"Observed evidence gap: {evidence_gap}")
        elif t.role == "candidate":
            intent = (t.scores or {}).get("candidate_intent", "answer")
            label = {
                "clarification": "Candidate clarification request",
                "candidate_question": "Candidate question for interviewer",
            }.get(str(intent), "Candidate")
            lines.append(f"{label}: {t.content.strip()}")
            delivery = (t.scores or {}).get("delivery")
            if delivery:
                lines.append(f"Delivery evidence: {json.dumps(delivery)}")
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
    data["_routing"] = routing_metadata(chain)
    logger.info("Live interview summary served by %s/%s", chain.last_served, chain.last_model)
    return data


def should_end_live_interview(session: InterviewSession, meta: dict[str, Any]) -> bool:
    if meta.get("action") == "candidate_questions":
        return False
    if meta.get("end_interview"):
        return True
    if meta.get("action") == "closing":
        return True
    state = session.live_state or {}
    themes = state.get("themes_covered") or []
    questions = session.questions or []
    turn_count = int(state.get("turn_count", 0))
    if (
        questions
        and len(themes) >= len(questions)
        and state.get("candidate_questions_asked")
        and turn_count >= len(questions) + 1
    ):
        return True
    if turn_count >= max(len(questions) * 2, 12):
        return True
    return False
