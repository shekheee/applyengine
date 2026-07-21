from __future__ import annotations

import logging

from collections.abc import AsyncIterator, Iterator
from typing import Any

from app import prompts
from app.llm import build_coach_provider, build_memory_provider, get_provider
from app.models import Application, ChatMessage, Job, Memory, Profile
from app.services.profession import profession_context
from app.services.attachments import ProcessedAttachment, build_user_content

logger = logging.getLogger(__name__)

HISTORY_LIMIT = 40


def _memory_text(memories: list[Memory]) -> str:
    return "\n".join(f"- ({m.kind}) {m.content}" for m in memories)


def _applications_text(applications: list[Application], jobs: dict[int, Job]) -> str:
    if not applications:
        return ""
    lines: list[str] = []
    for app in applications[-8:]:
        job = jobs.get(app.job_id)
        if not job:
            continue
        fit = f", fit {app.fit_score:.0f}%" if app.fit_score is not None else ""
        lines.append(
            f"- {job.title} at {job.company} [{app.status.value}{fit}]"
        )
    return "\n".join(lines)


def _target_job(
    applications: list[Application] | None, jobs: dict[int, Job] | None
) -> Job | None:
    if not applications or not jobs:
        return None
    for app in reversed(applications):
        job = jobs.get(app.job_id)
        if job:
            return job
    return None


def build_coach_messages(
    message: str,
    profile: Profile | None,
    memories: list[Memory],
    history: list[ChatMessage],
    attachments: list[ProcessedAttachment] | None = None,
    applications: list[Application] | None = None,
    jobs: dict[int, Job] | None = None,
    conversation_jd_text: str = "",
    conversation_job: Job | None = None,
) -> list[dict[str, Any]]:
    profile_text = _profile_text(profile)
    memory_text = _memory_text(memories)
    apps_text = _applications_text(applications or [], jobs or {})
    target = conversation_job or _target_job(applications, jobs)
    profession_text = profession_context(profile, target)

    system = prompts.coach_system_with_context(
        profile_text,
        memory_text,
        apps_text,
        profession_text,
        conversation_jd_text=conversation_jd_text,
    )
    messages: list[dict[str, Any]] = [{"role": "system", "content": system}]

    for msg in history[-HISTORY_LIMIT:]:
        role = "assistant" if msg.role == "assistant" else "user"
        messages.append({"role": role, "content": msg.content})

    user_content = build_user_content(message, attachments or [])
    messages.append({"role": "user", "content": user_content})
    return messages


def coach_reply(
    message: str,
    profile: Profile | None,
    memories: list[Memory],
    history: list[ChatMessage],
    attachments: list[ProcessedAttachment] | None = None,
    applications: list[Application] | None = None,
    jobs: dict[int, Job] | None = None,
    model_id: str | None = None,
    conversation_jd_text: str = "",
    conversation_job: Job | None = None,
) -> tuple[str, str | None, str | None]:
    chain = build_coach_provider(model_id)
    chain.reset()
    messages = build_coach_messages(
        message,
        profile,
        memories,
        history,
        attachments,
        applications,
        jobs,
        conversation_jd_text=conversation_jd_text,
        conversation_job=conversation_job,
    )
    try:
        out = chain.chat_messages(messages).strip()
        if out:
            return out, chain.last_served, chain.last_model
    except Exception:
        pass

    return (
        "Got it — tell me more about that. What was the impact, and can you put a "
        "number on it (time saved, accuracy, revenue, scale)? I'll help you turn it "
        "into a strong resume bullet.",
        chain.last_served,
        chain.last_model,
    )


def coach_reply_stream(
    message: str,
    profile: Profile | None,
    memories: list[Memory],
    history: list[ChatMessage],
    attachments: list[ProcessedAttachment] | None = None,
    applications: list[Application] | None = None,
    jobs: dict[int, Job] | None = None,
    model_id: str | None = None,
    served: dict | None = None,
    conversation_jd_text: str = "",
    conversation_job: Job | None = None,
) -> Iterator[str]:
    chain = build_coach_provider(model_id)
    chain.reset()
    messages = build_coach_messages(
        message,
        profile,
        memories,
        history,
        attachments,
        applications,
        jobs,
        conversation_jd_text=conversation_jd_text,
        conversation_job=conversation_job,
    )
    for token in chain.chat_stream(messages):
        yield token
    if served is not None:
        served["provider"] = chain.last_served
        served["model"] = chain.last_model


async def coach_reply_stream_async(
    message: str,
    profile: Profile | None,
    memories: list[Memory],
    history: list[ChatMessage],
    attachments: list[ProcessedAttachment] | None = None,
    applications: list[Application] | None = None,
    jobs: dict[int, Job] | None = None,
    model_id: str | None = None,
    served: dict | None = None,
    conversation_jd_text: str = "",
    conversation_job: Job | None = None,
) -> AsyncIterator[str]:
    chain = build_coach_provider(model_id)
    chain.reset()
    messages = build_coach_messages(
        message,
        profile,
        memories,
        history,
        attachments,
        applications,
        jobs,
        conversation_jd_text=conversation_jd_text,
        conversation_job=conversation_job,
    )
    async for token in chain.chat_stream_async(messages):
        yield token
    if served is not None:
        served["provider"] = chain.last_served
        served["model"] = chain.last_model


def extract_memories(
    user_message: str,
    assistant_reply: str,
    existing: list[Memory],
) -> list[dict[str, str]]:
    """Ask the LLM for new durable facts stated by the user this turn."""
    exchange = f"User: {user_message}\nCoach: {assistant_reply}"
    existing_text = _memory_text(existing)
    try:
        chain = build_memory_provider()
        chain.reset()
        data = chain.chat_json(
            prompts.MEMORY_EXTRACT_SYSTEM,
            prompts.memory_extract_user(exchange, existing_text),
        )
        if chain.last_served:
            logger.info(
                "Memory extraction served by %s/%s",
                chain.last_served,
                chain.last_model,
            )
    except Exception as exc:
        logger.warning("Memory extraction failed (non-fatal): %s", exc)
        return []

    raw = data.get("memories", []) if isinstance(data, dict) else []
    allowed = {"skill", "experience", "achievement", "preference", "goal", "fact"}
    seen = {m.content.strip().lower() for m in existing}
    out: list[dict[str, str]] = []
    for item in raw[:5]:
        if not isinstance(item, dict):
            continue
        content = str(item.get("content", "")).strip()
        kind = str(item.get("kind", "fact")).strip().lower()
        if kind not in allowed:
            kind = "fact"
        if content and content.lower() not in seen:
            seen.add(content.lower())
            out.append({"kind": kind, "content": content})
    return out


def build_updated_resume_text(profile: Profile | None, memories: list[Memory]) -> str:
    """Produce an improved plain-text resume from the profile + learned facts."""
    provider = get_provider()
    profile_text = _profile_text(profile)
    memory_text = _memory_text(memories)
    out = provider.chat(
        prompts.RESUME_UPDATE_SYSTEM,
        prompts.resume_update_user(profile_text, memory_text),
    ).strip()
    if out:
        return out

    extra = "\n".join(f"- {m.content}" for m in memories)
    base = profile_text or ""
    if extra:
        return f"{base}\n\nADDITIONAL HIGHLIGHTS\n{extra}".strip()
    return base


def _profile_text(profile: Profile | None) -> str:
    if profile is None:
        return ""
    from app.services.serialize import profile_to_text

    return profile_to_text(profile)
