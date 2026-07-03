from __future__ import annotations

from app import prompts
from app.llm import get_provider
from app.models import ChatMessage, Memory, Profile


def _history_text(messages: list[ChatMessage], limit: int = 12) -> str:
    recent = messages[-limit:]
    lines = []
    for m in recent:
        who = "User" if m.role == "user" else "Coach"
        lines.append(f"{who}: {m.content}")
    return "\n".join(lines)


def _memory_text(memories: list[Memory]) -> str:
    return "\n".join(f"- ({m.kind}) {m.content}" for m in memories)


def coach_reply(
    message: str,
    profile: Profile | None,
    memories: list[Memory],
    history: list[ChatMessage],
) -> str:
    provider = get_provider()
    profile_text = _profile_text(profile)
    memory_text = _memory_text(memories)
    hist = _history_text(history)
    out = provider.chat(
        prompts.COACH_SYSTEM,
        prompts.coach_user(message, profile_text, memory_text, hist),
    )
    out = out.strip()
    if out:
        return out

    # Offline fallback: still feel like a coach.
    return (
        "Got it — tell me more about that. What was the impact, and can you put a "
        "number on it (time saved, accuracy, revenue, scale)? I'll help you turn it "
        "into a strong resume bullet."
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

    # Offline fallback: append learned facts under an "Additional Highlights" section.
    extra = "\n".join(f"- {m.content}" for m in memories)
    base = profile_text or ""
    if extra:
        return f"{base}\n\nADDITIONAL HIGHLIGHTS\n{extra}".strip()
    return base


def _profile_text(profile: Profile | None) -> str:
    if profile is None:
        return ""
    # Local import avoids a circular import at module load.
    from app.services.serialize import profile_to_text

    return profile_to_text(profile)
