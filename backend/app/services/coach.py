from __future__ import annotations

from collections.abc import AsyncIterator, Iterator
from typing import Any

from app import prompts
from app.llm import get_provider
from app.llm.openai_provider import OpenAIProvider
from app.models import Application, ChatMessage, Job, Memory, Profile
from app.services.attachments import ProcessedAttachment, build_user_content

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


def build_coach_messages(
    message: str,
    profile: Profile | None,
    memories: list[Memory],
    history: list[ChatMessage],
    attachments: list[ProcessedAttachment] | None = None,
    applications: list[Application] | None = None,
    jobs: dict[int, Job] | None = None,
) -> list[dict[str, Any]]:
    profile_text = _profile_text(profile)
    memory_text = _memory_text(memories)
    apps_text = _applications_text(applications or [], jobs or {})

    system = prompts.coach_system_with_context(profile_text, memory_text, apps_text)
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
) -> str:
    provider = get_provider()
    messages = build_coach_messages(
        message, profile, memories, history, attachments, applications, jobs
    )
    if isinstance(provider, OpenAIProvider):
        out = provider.chat_messages(messages).strip()
    else:
        # Non-OpenAI providers: flatten to legacy system+user call.
        out = provider.chat(
            messages[0]["content"],
            str(messages[-1]["content"]),
        ).strip()
    if out:
        return out

    return (
        "Got it — tell me more about that. What was the impact, and can you put a "
        "number on it (time saved, accuracy, revenue, scale)? I'll help you turn it "
        "into a strong resume bullet."
    )


def coach_reply_stream(
    message: str,
    profile: Profile | None,
    memories: list[Memory],
    history: list[ChatMessage],
    attachments: list[ProcessedAttachment] | None = None,
    applications: list[Application] | None = None,
    jobs: dict[int, Job] | None = None,
) -> Iterator[str]:
    provider = get_provider()
    messages = build_coach_messages(
        message, profile, memories, history, attachments, applications, jobs
    )
    if isinstance(provider, OpenAIProvider):
        yield from provider.chat_stream(messages)
    else:
        yield coach_reply(
            message, profile, memories, history, attachments, applications, jobs
        )


async def coach_reply_stream_async(
    message: str,
    profile: Profile | None,
    memories: list[Memory],
    history: list[ChatMessage],
    attachments: list[ProcessedAttachment] | None = None,
    applications: list[Application] | None = None,
    jobs: dict[int, Job] | None = None,
) -> AsyncIterator[str]:
    provider = get_provider()
    messages = build_coach_messages(
        message, profile, memories, history, attachments, applications, jobs
    )
    if isinstance(provider, OpenAIProvider):
        async for token in provider.chat_stream_async(messages):
            yield token
    else:
        yield coach_reply(
            message, profile, memories, history, attachments, applications, jobs
        )


def extract_memories(
    user_message: str,
    assistant_reply: str,
    existing: list[Memory],
) -> list[dict[str, str]]:
    """Ask the LLM for new durable facts stated by the user this turn."""
    provider = get_provider()
    exchange = f"User: {user_message}\nCoach: {assistant_reply}"
    existing_text = _memory_text(existing)
    data = provider.chat_json(
        prompts.MEMORY_EXTRACT_SYSTEM,
        prompts.memory_extract_user(exchange, existing_text),
    )
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
