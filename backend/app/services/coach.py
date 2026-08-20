from __future__ import annotations

import logging
import re

from collections.abc import AsyncIterator, Iterator
from time import monotonic
from typing import Any

from app import prompts
from app.config import get_settings
from app.llm import build_coach_provider, build_memory_provider, get_provider
from app.llm.answer_length import answer_length_instruction
from app.models import Application, ChatMessage, Job, Memory, Profile
from app.services.profession import profession_context
from app.services.privacy import IdentifierPrivacy, private_profile_to_text
from app.services.attachments import ProcessedAttachment, build_user_content
from app.services.web_research import (
    inject_research,
    run_web_research,
    sources_markdown,
)

logger = logging.getLogger(__name__)

_TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9+#.-]{2,}", re.IGNORECASE)
_DURABLE_MEMORY_RE = re.compile(
    r"\b(i|my)\b.{0,80}\b(led|built|created|delivered|managed|owned|worked|"
    r"achieved|improved|reduced|increased|saved|launched|designed|implemented|"
    r"prefer|want|goal|experience|responsible|skilled|learned)\b",
    re.IGNORECASE | re.DOTALL,
)


def _memory_text(memories: list[Memory]) -> str:
    return "\n".join(f"- ({m.kind}) {m.content}" for m in memories)


def _terms(value: str) -> set[str]:
    return {token.lower() for token in _TOKEN_RE.findall(value)}


def _relevant_memories(
    message: str, memories: list[Memory], limit: int
) -> list[Memory]:
    if len(memories) <= limit:
        return memories
    query = _terms(message)
    scored: list[tuple[int, int, Memory]] = []
    for index, memory in enumerate(memories):
        overlap = len(query & _terms(memory.content))
        priority = 2 if memory.kind in {"achievement", "experience", "goal"} else 0
        scored.append((overlap * 10 + priority, index, memory))
    relevant = [item[2] for item in sorted(scored, reverse=True)[:limit]]
    return list(reversed(relevant))


def _applications_text(applications: list[Application], jobs: dict[int, Job]) -> str:
    if not applications:
        return ""
    lines: list[str] = []
    for app in applications[-4:]:
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
    answer_length: str = "normal",
    coach_mode: str = "career",
    delivery_context: str = "",
    conversation_summary: str = "",
) -> list[dict[str, Any]]:
    settings = get_settings()
    profile_text, privacy = private_profile_to_text(profile)
    profile_text = profile_text[:10000]
    selected_memories = _relevant_memories(
        message, memories, max(1, settings.coach_relevant_memory_limit)
    )
    memory_text = _memory_text(selected_memories)
    apps_text = _applications_text(applications or [], jobs or {})
    target = conversation_job or _target_job(applications, jobs)
    # The canonical serialized profile below already contains resume signals.
    # Keep this block job-only so Coach never receives overlapping profile copies.
    profession_text = profession_context(profile, target, include_profile=False)

    system = prompts.coach_system_with_context(
        profile_text,
        memory_text,
        apps_text,
        profession_text,
        conversation_jd_text=conversation_jd_text[:8000],
        coach_mode=coach_mode,
        delivery_context=delivery_context,
    )
    if conversation_summary.strip():
        system += (
            "\n\n---\n\nOLDER CONVERSATION SUMMARY:\n"
            + conversation_summary.strip()[:5000]
        )
    system += f"\n\nRESPONSE LENGTH FOR THIS TURN:\n{answer_length_instruction(answer_length)}"
    messages: list[dict[str, Any]] = [{"role": "system", "content": system}]

    recent_limit = max(4, settings.coach_recent_message_limit)
    for msg in history[-recent_limit:]:
        role = "assistant" if msg.role == "assistant" else "user"
        messages.append({"role": role, "content": msg.content})

    user_content = build_user_content(message, attachments or [])
    messages.append({"role": "user", "content": user_content})
    return privacy.protect_messages(messages)


def coach_reply(
    message: str,
    profile: Profile | None,
    memories: list[Memory],
    history: list[ChatMessage],
    attachments: list[ProcessedAttachment] | None = None,
    applications: list[Application] | None = None,
    jobs: dict[int, Job] | None = None,
    model_id: str | None = None,
    reasoning_effort: str | None = None,
    conversation_jd_text: str = "",
    conversation_job: Job | None = None,
    answer_length: str = "normal",
    coach_mode: str = "career",
    delivery_context: str = "",
    conversation_summary: str = "",
) -> tuple[str, str | None, str | None]:
    chain = build_coach_provider(model_id, reasoning_effort)
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
        answer_length=answer_length,
        coach_mode=coach_mode,
        delivery_context=delivery_context,
        conversation_summary=conversation_summary,
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
    reasoning_effort: str | None = None,
    served: dict | None = None,
    conversation_jd_text: str = "",
    conversation_job: Job | None = None,
    answer_length: str = "normal",
    coach_mode: str = "career",
    delivery_context: str = "",
    conversation_summary: str = "",
) -> Iterator[str]:
    chain = build_coach_provider(model_id, reasoning_effort)
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
        answer_length=answer_length,
        coach_mode=coach_mode,
        delivery_context=delivery_context,
        conversation_summary=conversation_summary,
    )
    for token in chain.chat_stream(messages):
        if served is not None:
            served.update(
                {
                    "provider": chain.last_served,
                    "model": chain.last_model,
                    "requested_model": chain.requested_model,
                    "fallback_used": chain.fallback_used,
                    "fallback_reason": chain.fallback_reason,
                    "reasoning_effort": chain.reasoning_effort,
                }
            )
        yield token
    if served is not None:
        served["provider"] = chain.last_served
        served["model"] = chain.last_model
        served["requested_model"] = chain.requested_model
        served["fallback_used"] = chain.fallback_used
        served["fallback_reason"] = chain.fallback_reason
        served["reasoning_effort"] = chain.reasoning_effort


async def coach_reply_stream_async(
    message: str,
    profile: Profile | None,
    memories: list[Memory],
    history: list[ChatMessage],
    attachments: list[ProcessedAttachment] | None = None,
    applications: list[Application] | None = None,
    jobs: dict[int, Job] | None = None,
    model_id: str | None = None,
    reasoning_effort: str | None = None,
    served: dict | None = None,
    conversation_jd_text: str = "",
    conversation_job: Job | None = None,
    web_search_mode: str = "auto",
    answer_length: str = "normal",
    coach_mode: str = "career",
    delivery_context: str = "",
    conversation_summary: str = "",
) -> AsyncIterator[str]:
    chain = build_coach_provider(model_id, reasoning_effort)
    chain.reset()
    privacy = IdentifierPrivacy.from_profile(profile)
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
        answer_length=answer_length,
        coach_mode=coach_mode,
        delivery_context=delivery_context,
        conversation_summary=conversation_summary,
    )
    request_started = monotonic()
    search_started = monotonic()
    try:
        research = await run_web_research(
            privacy.mask_text(message),
            model_id=model_id,
            mode=web_search_mode,
            context_hint=privacy.mask_text(conversation_jd_text),
        )
    except Exception as exc:
        logger.warning("Live web research failed; continuing without it: %s", exc)
        research = None
        if served is not None:
            served["web_search_error"] = str(exc)
    if served is not None:
        served["search_duration_ms"] = round((monotonic() - search_started) * 1000)
    if research is not None:
        messages = inject_research(messages, research)
        if served is not None:
            served["web_searched"] = True
            served["search_provider"] = research.provider
            served["search_cache_hit"] = research.cached
            served["sources"] = [
                {"title": source.title, "url": source.url}
                for source in research.sources
            ]
    model_started = monotonic()
    first_token_seen = False
    async for token in chain.chat_stream_async(
        messages,
        first_token_timeout=get_settings().coach_first_token_timeout_seconds,
    ):
        if not first_token_seen:
            first_token_seen = True
            if served is not None:
                served["time_to_first_token_ms"] = round(
                    (monotonic() - request_started) * 1000
                )
        if served is not None:
            served.update(
                {
                    "provider": chain.last_served,
                    "model": chain.last_model,
                    "requested_model": chain.requested_model,
                    "fallback_used": chain.fallback_used,
                    "fallback_reason": chain.fallback_reason,
                    "reasoning_effort": chain.reasoning_effort,
                }
            )
        yield token
    if research is not None:
        source_block = sources_markdown(research)
        if source_block:
            yield source_block
    if served is not None:
        served["provider"] = chain.last_served
        served["model"] = chain.last_model
        served["requested_model"] = chain.requested_model
        served["fallback_used"] = chain.fallback_used
        served["fallback_reason"] = chain.fallback_reason
        served["reasoning_effort"] = chain.reasoning_effort
        served["generation_duration_ms"] = round(
            (monotonic() - model_started) * 1000
        )
        served["total_duration_ms"] = round((monotonic() - request_started) * 1000)


def should_extract_memories(user_message: str) -> bool:
    """Cheap gate: only durable first-person facts merit a memory model call."""
    text = " ".join(user_message.split())
    if len(text) < 35 or text in {"(attachment)", "Please review the attached file(s)."}:
        return False
    return bool(_DURABLE_MEMORY_RE.search(text))


def extract_memories(
    user_message: str,
    assistant_reply: str,
    existing: list[Memory],
    profile: Profile | None = None,
) -> list[dict[str, str]]:
    """Ask the LLM for new durable facts stated by the user this turn."""
    if not should_extract_memories(user_message):
        return []
    privacy = IdentifierPrivacy.from_profile(profile)
    exchange = privacy.mask_text(f"User: {user_message}\nCoach: {assistant_reply}")
    existing_text = privacy.mask_text(_memory_text(existing))
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
    return privacy.restore(out)


def summarize_conversation_context(
    existing_summary: str,
    messages: list[ChatMessage],
    profile: Profile | None = None,
) -> str:
    """Compact older turns for provider-neutral long-conversation continuity."""
    if not messages:
        return existing_summary
    privacy = IdentifierPrivacy.from_profile(profile)
    transcript = privacy.mask_text("\n".join(
        f"{m.role.upper()}: {' '.join(m.content.split())[:1200]}" for m in messages
    ))
    system = """Compact an older career-coaching conversation into durable working context.
Return plain text under 500 words. Preserve: candidate facts and metrics, goals and preferences,
decisions, examples already used, advice accepted or rejected, and unresolved follow-ups.
Remove pleasantries, repetition, model wording, and anything unsupported. Do not invent facts."""
    user = f"""EXISTING SUMMARY:
{privacy.mask_text(existing_summary) or '(none)'}

NEW OLDER TURNS TO MERGE:
{transcript}"""
    try:
        chain = build_memory_provider()
        chain.reset()
        summary = chain.chat_messages(
            [{"role": "system", "content": system}, {"role": "user", "content": user}],
            max_tokens=700,
        ).strip()
        return privacy.restore_text(summary[:6000]) or existing_summary
    except Exception as exc:
        logger.warning("Conversation summary failed (non-fatal): %s", exc)
        return existing_summary


def build_updated_resume_text(profile: Profile | None, memories: list[Memory]) -> str:
    """Produce an improved plain-text resume from the profile + learned facts."""
    provider = get_provider()
    profile_text, privacy = private_profile_to_text(profile)
    memory_text = privacy.mask_text(_memory_text(memories))
    out = provider.chat(
        prompts.RESUME_UPDATE_SYSTEM,
        prompts.resume_update_user(profile_text, memory_text),
    ).strip()
    if out:
        return privacy.restore_text(out)

    extra = "\n".join(f"- {m.content}" for m in memories)
    base = privacy.restore_text(profile_text) if profile_text else ""
    if extra:
        return f"{base}\n\nADDITIONAL HIGHLIGHTS\n{extra}".strip()
    return base


def _profile_text(profile: Profile | None) -> str:
    if profile is None:
        return ""
    from app.services.serialize import profile_to_text

    return profile_to_text(profile)
