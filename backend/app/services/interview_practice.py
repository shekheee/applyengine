from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator, Iterator
from typing import Any

from app import prompts
from app.llm.factory import build_coach_provider
from app.models import InterviewSession, InterviewTurn, Job, Memory, Profile
from app.services.serialize import job_to_text, profile_to_text

logger = logging.getLogger(__name__)

FOCUS_LABELS = {
    "behavioral": "Behavioral (STAR)",
    "technical_ml": "ML / AI Technical",
    "system_design": "ML System Design",
    "resume_deep": "Resume Deep-Dive",
    "mixed": "Mixed (behavioral + technical + resume)",
}


def _memories_text(memories: list[Memory]) -> str:
    return "\n".join(f"- ({m.kind}) {m.content}" for m in memories)


def _chain(model_id: str | None):
    chain = build_coach_provider(model_id)
    chain.reset()
    return chain


def generate_questions(
    profile: Profile | None,
    job: Job | None,
    memories: list[Memory],
    *,
    focus: str,
    difficulty: str,
    model_id: str | None = None,
) -> list[dict[str, Any]]:
    chain = _chain(model_id)
    data = chain.chat_json(
        prompts.INTERVIEW_QUESTIONS_SYSTEM,
        prompts.interview_questions_user(
            profile_to_text(profile) if profile else "",
            job_to_text(job) if job else "",
            focus,
            difficulty,
            _memories_text(memories),
        ),
    )
    raw = data.get("questions", []) if isinstance(data, dict) else []
    questions: list[dict[str, Any]] = []
    for i, q in enumerate(raw[:6]):
        if isinstance(q, str):
            questions.append({"text": q, "category": focus, "tip": ""})
        elif isinstance(q, dict) and q.get("text"):
            questions.append(
                {
                    "text": str(q["text"]).strip(),
                    "category": str(q.get("category", focus)),
                    "tip": str(q.get("tip", "")),
                }
            )
    if not questions:
        questions = _fallback_questions(profile, job, focus)
    for i, q in enumerate(questions):
        q.setdefault("id", i)
    logger.info("Interview questions served by %s/%s", chain.last_served, chain.last_model)
    return questions


def _fallback_questions(
    profile: Profile | None, job: Job | None, focus: str
) -> list[dict[str, Any]]:
    name = profile.name if profile else "you"
    company = job.company if job else "your target company"
    return [
        {
            "text": f"Tell me about yourself and why you're a strong fit for a Data Science / AI role at {company}.",
            "category": "behavioral",
            "tip": "2-min pitch: current focus, 2-3 highlights, why this role.",
        },
        {
            "text": f"Walk me through a project on {name}'s resume where you delivered measurable ML impact.",
            "category": "resume_deep",
            "tip": "STAR + metrics + your specific contribution.",
        },
        {
            "text": "How would you design a production ML pipeline with monitoring and retraining?",
            "category": "system_design",
            "tip": "Data → train → serve → monitor → drift → retrain.",
        },
        {
            "text": "Explain how you would evaluate a model beyond accuracy for an imbalanced problem.",
            "category": "technical_ml",
            "tip": "Precision/recall, PR-AUC, business cost, calibration.",
        },
        {
            "text": "Describe a time you disagreed with a stakeholder about a model or metric. What happened?",
            "category": "behavioral",
            "tip": "STAR with data-driven resolution.",
        },
    ]


def evaluate_answer(
    question: str,
    answer: str,
    profile: Profile | None,
    job: Job | None,
    prior_turns: list[InterviewTurn],
    question_index: int,
    *,
    model_id: str | None = None,
) -> dict[str, Any]:
    chain = _chain(model_id)
    prior = "\n".join(
        f"[{t.role}] {t.content}"
        for t in prior_turns
        if t.question_index == question_index and t.role == "followup"
    )
    data = chain.chat_json(
        prompts.INTERVIEW_FEEDBACK_SYSTEM,
        prompts.interview_feedback_user(
            question,
            answer,
            profile_to_text(profile) if profile else "",
            job_to_text(job) if job else "",
            prior,
        ),
    )
    if not isinstance(data, dict):
        data = {}
    logger.info("Interview feedback served by %s/%s", chain.last_served, chain.last_model)
    return data


def feedback_to_markdown(fb: dict[str, Any]) -> str:
    score = fb.get("overall_score", "—")
    lines = [f"### Feedback · **{score}/10**", ""]
    if fb.get("strengths"):
        lines.append("**Strengths**")
        lines.extend(f"- {s}" for s in fb["strengths"])
        lines.append("")
    if fb.get("improvements"):
        lines.append("**Improve**")
        lines.extend(f"- {s}" for s in fb["improvements"])
        lines.append("")
    if fb.get("star_guidance"):
        lines.append(f"**STAR tip:** {fb['star_guidance']}")
        lines.append("")
    if fb.get("stronger_phrasing"):
        lines.append(f"**Stronger phrasing:** {fb['stronger_phrasing']}")
        lines.append("")
    if fb.get("model_answer_outline"):
        lines.append("**Model answer outline**")
        lines.append(fb["model_answer_outline"])
        lines.append("")
    if fb.get("follow_up_question"):
        lines.append(f"**Follow-up to practice:** {fb['follow_up_question']}")
    return "\n".join(lines).strip()


def stream_followup(
    question: str,
    history: list[dict[str, str]],
    profile: Profile | None,
    *,
    model_id: str | None = None,
) -> Iterator[str]:
    chain = _chain(model_id)
    messages = [
        {
            "role": "system",
            "content": (
                prompts.INTERVIEW_FOLLOWUP_SYSTEM
                + f"\n\nCurrent interview question:\n{question}\n\n"
                f"Candidate resume:\n{profile_to_text(profile) if profile else '(none)'}"
            ),
        }
    ]
    for h in history[-8:]:
        messages.append({"role": h["role"], "content": h["content"]})
    for token in chain.chat_stream(messages):
        yield token


async def stream_followup_async(
    question: str,
    history: list[dict[str, str]],
    profile: Profile | None,
    *,
    model_id: str | None = None,
) -> AsyncIterator[str]:
    chain = _chain(model_id)
    messages = [
        {
            "role": "system",
            "content": (
                prompts.INTERVIEW_FOLLOWUP_SYSTEM
                + f"\n\nCurrent interview question:\n{question}\n\n"
                f"Candidate resume:\n{profile_to_text(profile) if profile else '(none)'}"
            ),
        }
    ]
    for h in history[-8:]:
        messages.append({"role": h["role"], "content": h["content"]})
    async for token in chain.chat_stream_async(messages):
        yield token


def build_transcript(session: InterviewSession, turns: list[InterviewTurn]) -> str:
    lines: list[str] = []
    for i, q in enumerate(session.questions or []):
        lines.append(f"Q{i + 1}: {q.get('text', '')}")
    for t in turns:
        label = {"candidate": "Answer", "feedback": "Feedback", "followup": "Follow-up"}.get(
            t.role, t.role
        )
        lines.append(f"{label} (Q{t.question_index + 1}): {t.content[:2000]}")
        if t.scores:
            lines.append(f"  Scores: {json.dumps(t.scores)}")
    return "\n\n".join(lines)


def generate_summary(
    session: InterviewSession,
    turns: list[InterviewTurn],
    profile: Profile | None,
    job: Job | None,
    *,
    model_id: str | None = None,
) -> dict[str, Any]:
    chain = _chain(model_id)
    data = chain.chat_json(
        prompts.INTERVIEW_SUMMARY_SYSTEM,
        prompts.interview_summary_user(
            profile_to_text(profile) if profile else "",
            job_to_text(job) if job else "",
            build_transcript(session, turns),
        ),
    )
    if not isinstance(data, dict):
        data = {}
    logger.info("Interview summary served by %s/%s", chain.last_served, chain.last_model)
    return data


def summary_to_markdown(summary: dict[str, Any]) -> str:
    lines = [
        f"## Session complete · **{summary.get('overall_score', '—')}/10**",
        "",
    ]
    if summary.get("strengths"):
        lines.append("### Top strengths")
        lines.extend(f"- {s}" for s in summary["strengths"])
        lines.append("")
    if summary.get("priority_improvements"):
        lines.append("### Priority improvements")
        lines.extend(f"- {s}" for s in summary["priority_improvements"])
        lines.append("")
    if summary.get("recurring_weaknesses"):
        lines.append("### Recurring patterns")
        lines.extend(f"- {s}" for s in summary["recurring_weaknesses"])
        lines.append("")
    if summary.get("skill_pointers"):
        lines.append("### Skill enhancement pointers")
        lines.extend(f"- {s}" for s in summary["skill_pointers"])
        lines.append("")
    if summary.get("next_steps"):
        lines.append("### Next steps")
        lines.extend(f"- {s}" for s in summary["next_steps"])
        lines.append("")
    per_q = summary.get("per_question") or []
    if per_q:
        lines.append("### Question scores")
        for pq in per_q:
            if isinstance(pq, dict):
                lines.append(
                    f"- **{pq.get('score', '—')}/10** — {pq.get('question', '')[:80]}… "
                    f"_{pq.get('key_feedback', '')}_"
                )
    return "\n".join(lines).strip()
