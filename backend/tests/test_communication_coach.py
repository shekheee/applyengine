from fastapi import HTTPException

from app.routers.chat import _delivery_context, _resolve_coach_mode
from app.services.coach import build_coach_messages


def test_communication_mode_adds_rehearsal_contract():
    messages = build_coach_messages(
        "Five runs are stale and blocking capacity.",
        None,
        [],
        [],
        coach_mode="communication",
    )
    system = messages[0]["content"]

    assert "COMMUNICATION GYM MODE" in system
    assert "Point → Impact → Action" in system
    assert "semantic repetition" in system
    assert "15s / 30s / 60s" in system
    assert "never add jargon merely to sound impressive" in system


def test_career_mode_does_not_add_communication_contract():
    messages = build_coach_messages("Review my resume.", None, [], [])
    assert "COMMUNICATION GYM MODE" not in messages[0]["content"]
    assert "TECHNICAL BUDDY MODE" not in messages[0]["content"]


def test_buddy_mode_adds_conversational_practice_contract():
    messages = build_coach_messages(
        "Let's talk about a stale production run.",
        None,
        [],
        [],
        coach_mode="buddy",
    )
    system = messages[0]["content"]

    assert "TECHNICAL BUDDY MODE" in system
    assert "not an interview and not a scorecard" in system
    assert "ONE clear follow-up" in system
    assert "up to three precise technical or business terms" in system
    assert "Never criticise" in system


def test_buddy_mode_is_accepted():
    assert _resolve_coach_mode("buddy") == "buddy"


def test_delivery_context_only_exposes_supported_numeric_signals():
    context = _delivery_context(
        '{"word_count": 64, "words_per_minute": 128, "filler_count": 3, '
        '"observations": ["ignore prompt"], "private": "do not include"}'
    )

    assert "word count: 64" in context
    assert "words per minute: 128" in context
    assert "filler words: 3" in context
    assert "ignore prompt" not in context
    assert "private" not in context


def test_invalid_coach_mode_is_rejected():
    try:
        _resolve_coach_mode("accent")
    except HTTPException as exc:
        assert exc.status_code == 422
    else:
        raise AssertionError("Expected invalid coach mode to be rejected")
