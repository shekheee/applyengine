from types import SimpleNamespace

from app.services.coach import build_coach_messages, should_extract_memories


def test_coach_uses_recent_turns_and_rolling_summary():
    history = [
        SimpleNamespace(role="user" if index % 2 == 0 else "assistant", content=f"turn {index}")
        for index in range(16)
    ]

    messages = build_coach_messages(
        "What should I practise next?",
        None,
        [],
        history,
        conversation_summary="Earlier, the candidate chose concise stakeholder updates.",
    )

    assert "OLDER CONVERSATION SUMMARY" in messages[0]["content"]
    assert messages[1]["content"] == "turn 6"
    assert messages[-2]["content"] == "turn 15"
    assert messages[-1]["content"] == "What should I practise next?"
    assert len(messages) == 12


def test_memory_gate_skips_chitchat_and_accepts_durable_first_person_fact():
    assert not should_extract_memories("Thanks, that makes sense.")
    assert not should_extract_memories("Can you explain regularisation again?")
    assert should_extract_memories(
        "I led the migration of our scoring service and reduced stale runs by 35 percent."
    )
