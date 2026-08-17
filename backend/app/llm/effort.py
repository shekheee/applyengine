from __future__ import annotations

from typing import Literal

ReasoningEffort = Literal["medium", "high", "xhigh"]

_ALIASES = {
    "medium": "medium",
    "hard": "high",
    "high": "high",
    "very-hard": "xhigh",
    "very_hard": "xhigh",
    "very hard": "xhigh",
    "xhigh": "xhigh",
}


def normalize_reasoning_effort(
    value: str | None,
    *,
    default: ReasoningEffort | None = None,
) -> ReasoningEffort | None:
    if value is None or not value.strip():
        return default
    normalized = _ALIASES.get(value.strip().lower())
    if normalized is None:
        raise ValueError("Thinking depth must be medium, high, or xhigh")
    return normalized  # type: ignore[return-value]


def output_tokens_for_effort(effort: ReasoningEffort | None, base: int) -> int:
    if effort == "xhigh":
        return max(base, 32_768)
    if effort == "high":
        return max(base, 16_384)
    if effort == "medium":
        return max(base, 8_192)
    return base


def gemini_thinking_level(effort: ReasoningEffort | None) -> str | None:
    if effort == "xhigh":
        return "high"
    return effort
