from __future__ import annotations

from typing import Literal

AnswerLength = Literal["concise", "normal", "detailed"]

_INSTRUCTIONS: dict[AnswerLength, str] = {
    "concise": (
        "Answer concisely and directly. Prefer 2–4 short paragraphs or a compact list, "
        "usually no more than about 250 words. Keep essential evidence and next actions; "
        "omit repetition and background the user did not request."
    ),
    "normal": (
        "Give a balanced, practical answer with enough explanation to act on, usually no "
        "more than about 600 words. Use compact headings or lists only when they improve clarity."
    ),
    "detailed": (
        "Give a thorough answer with reasoning, examples, trade-offs, and concrete next steps "
        "where useful, usually no more than about 1,200 words. Stay structured and avoid filler."
    ),
}


def normalize_answer_length(
    value: str | None,
    *,
    default: AnswerLength = "normal",
) -> AnswerLength:
    if value is None or not value.strip():
        return default
    normalized = value.strip().lower()
    if normalized not in _INSTRUCTIONS:
        raise ValueError("Answer length must be concise, normal, or detailed")
    return normalized  # type: ignore[return-value]


def answer_length_instruction(value: str | None) -> str:
    return _INSTRUCTIONS[normalize_answer_length(value)]
