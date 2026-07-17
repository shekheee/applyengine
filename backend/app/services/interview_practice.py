from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator, Iterator
from typing import Any

from app import prompts
from app.llm.factory import build_coach_provider
from app.models import InterviewSession, InterviewTurn, Job, Memory, Profile
from app.services.ml_interview_curriculum import (
    curriculum_prompt_block,
    fallback_curriculum_questions,
    feedback_rubric_block,
    normalize_curriculum_topic,
)
from app.services.profession import (
    FOCUS_LABELS,
    focus_guide,
    focus_label,
    normalize_focus,
    profession_context,
)
from app.services.serialize import job_to_text, profile_to_text

logger = logging.getLogger(__name__)


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
    curriculum_topic: str = "",
) -> list[dict[str, Any]]:
    focus = normalize_focus(focus)
    curriculum_topic = normalize_curriculum_topic(curriculum_topic)
    prof_ctx = profession_context(profile, job)
    curriculum_text = curriculum_prompt_block(curriculum_topic) if curriculum_topic else ""
    chain = _chain(model_id)
    data = chain.chat_json(
        prompts.INTERVIEW_QUESTIONS_SYSTEM,
        prompts.interview_questions_user(
            profile_to_text(profile) if profile else "",
            job_to_text(job) if job else "",
            focus,
            difficulty,
            _memories_text(memories),
            profession_text=prof_ctx,
            focus_guide_text=focus_guide(focus),
            curriculum_text=curriculum_text,
        ),
    )
    raw = data.get("questions", []) if isinstance(data, dict) else []
    questions: list[dict[str, Any]] = []
    for i, q in enumerate(raw[:6]):
        if isinstance(q, str):
            cat = curriculum_topic if curriculum_topic and curriculum_topic != "all" else focus
            questions.append({"text": q, "category": cat, "tip": ""})
        elif isinstance(q, dict) and q.get("text"):
            cat = str(q.get("category", focus))
            if curriculum_topic and curriculum_topic != "all":
                cat = str(q.get("category", curriculum_topic))
            questions.append(
                {
                    "text": str(q["text"]).strip(),
                    "category": cat,
                    "tip": str(q.get("tip", "")),
                }
            )
    if not questions:
        if curriculum_topic:
            questions = fallback_curriculum_questions(
                curriculum_topic,
                profile,
                job.title if job else "",
            )
        else:
            questions = _fallback_questions(profile, job, focus)
    for i, q in enumerate(questions):
        q.setdefault("id", i)
    logger.info("Interview questions served by %s/%s", chain.last_served, chain.last_model)
    return questions


def _fallback_questions(
    profile: Profile | None, job: Job | None, focus: str
) -> list[dict[str, Any]]:
    focus = normalize_focus(focus)
    company = job.company if job else "the target organization"
    role = job.title if job else "this role"
    recent = ""
    if profile and profile.experience:
        exp = profile.experience[0]
        if isinstance(exp, dict):
            title = exp.get("title") or ""
            org = exp.get("company") or ""
            if title or org:
                recent = f" ({title} at {org})".strip()

    all_q = [
        {
            "text": f"Tell me about yourself and why you're a strong fit for {role} at {company}.",
            "category": "behavioral",
            "tip": "2-min pitch: current focus, 2-3 highlights, why this role.",
        },
        {
            "text": (
                f"Walk me through a significant achievement from your experience{recent} — "
                "what was your role and what measurable impact did you deliver?"
            ),
            "category": "resume_deep_dive",
            "tip": "STAR structure + your specific contribution + outcomes.",
        },
        {
            "text": (
                "Describe a challenging situation involving stakeholders or cross-functional "
                "partners. How did you align them and what was the result?"
            ),
            "category": "leadership_stakeholder",
            "tip": "Name stakeholders, your approach, resistance handled, outcome.",
        },
        {
            "text": (
                f"Given a complex scenario relevant to {role}, how would you structure your "
                "approach from discovery through delivery?"
            ),
            "category": "case_study",
            "tip": "Frame the problem, stakeholders, plan, risks, and success metrics.",
        },
        {
            "text": (
                "What are the core methods, frameworks, or technical skills you rely on most "
                "in your work, and how have you applied them recently?"
            ),
            "category": "role_technical",
            "tip": "Use field-appropriate methods from your resume with a concrete example.",
        },
        {
            "text": "Tell me about a time something did not go as planned. What did you learn?",
            "category": "behavioral",
            "tip": "Honest STAR with reflection and what you'd do differently.",
        },
    ]

    by_focus: dict[str, list[str]] = {
        "behavioral": ["behavioral"],
        "resume_deep_dive": ["resume_deep_dive", "behavioral"],
        "leadership_stakeholder": ["leadership_stakeholder", "behavioral"],
        "case_study": ["case_study", "leadership_stakeholder"],
        "role_technical": ["role_technical", "resume_deep_dive"],
        "mixed": ["behavioral", "resume_deep_dive", "leadership_stakeholder", "case_study", "role_technical"],
    }
    allowed = set(by_focus.get(focus, ["behavioral", "resume_deep_dive"]))
    if focus == "mixed":
        return all_q[:6]
    picked = [q for q in all_q if q["category"] in allowed]
    return picked[:5] if picked else all_q[:5]


def evaluate_answer(
    question: str,
    answer: str,
    profile: Profile | None,
    job: Job | None,
    prior_turns: list[InterviewTurn],
    question_index: int,
    *,
    model_id: str | None = None,
    curriculum_topic: str = "",
    question_category: str = "",
) -> dict[str, Any]:
    chain = _chain(model_id)
    prior = "\n".join(
        f"[{t.role}] {t.content}"
        for t in prior_turns
        if t.question_index == question_index and t.role == "followup"
    )
    prof_ctx = profession_context(profile, job)
    curriculum_topic = normalize_curriculum_topic(curriculum_topic)
    rubric = ""
    if curriculum_topic:
        rubric = feedback_rubric_block(curriculum_topic, question_category or curriculum_topic)
    data = chain.chat_json(
        prompts.INTERVIEW_FEEDBACK_SYSTEM,
        prompts.interview_feedback_user(
            question,
            answer,
            profile_to_text(profile) if profile else "",
            job_to_text(job) if job else "",
            prior,
            profession_text=prof_ctx,
            curriculum_rubric=rubric,
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
                + f"\n\nProfession context:\n{profession_context(profile, None)}\n\n"
                f"Current interview question:\n{question}\n\n"
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
                + f"\n\nProfession context:\n{profession_context(profile, None)}\n\n"
                f"Current interview question:\n{question}\n\n"
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
    prof_ctx = profession_context(profile, job)
    curriculum_topic = normalize_curriculum_topic(getattr(session, "curriculum_topic", "") or "")
    curriculum_text = curriculum_prompt_block(curriculum_topic) if curriculum_topic else ""
    data = chain.chat_json(
        prompts.INTERVIEW_SUMMARY_SYSTEM,
        prompts.interview_summary_user(
            profile_to_text(profile) if profile else "",
            job_to_text(job) if job else "",
            build_transcript(session, turns),
            profession_text=prof_ctx,
            curriculum_text=curriculum_text,
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
