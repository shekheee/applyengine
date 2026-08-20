from app.services import interview_practice
from app.models import InterviewSession
from app.services.live_interview import (
    _bounded_context,
    apply_live_meta,
    behavior_context,
    build_realtime_interview_instructions,
    govern_live_meta,
    should_end_live_interview,
)


def test_live_question_themes_do_not_block_on_llm(monkeypatch):
    def fail_if_called(*args, **kwargs):
        raise AssertionError("live setup should not call an LLM")

    monkeypatch.setattr(interview_practice, "_chain", fail_if_called)
    questions = interview_practice.generate_questions(
        None,
        None,
        [],
        focus="mixed",
        difficulty="senior",
        question_count=4,
        instant=True,
    )

    assert len(questions) == 4
    assert [question["id"] for question in questions] == [0, 1, 2, 3]


def test_live_context_is_bounded():
    result = _bounded_context("x" * 50, 20)

    assert result.startswith("x" * 20)
    assert result.endswith("[Context shortened for live response speed]")


def _session(**overrides):
    values = {
        "user_id": 1,
        "mode": "live",
        "questions": [
            {"text": "Warm-up", "category": "behavioral"},
            {"text": "Challenge", "category": "role_technical"},
        ],
        "current_index": 1,
        "live_state": {
            "behavior_mode": "simulation",
            "interviewer_persona": "hiring_manager",
            "themes_covered": [0],
            "turn_count": 3,
        },
    }
    values.update(overrides)
    return InterviewSession(**values)


def test_final_theme_moves_to_candidate_questions_before_closing():
    session = _session()

    meta = govern_live_meta(
        session,
        {"action": "closing", "end_interview": True},
        candidate_answer="I delivered a 20 percent improvement.",
        candidate_intent="answer",
    )

    assert meta["action"] == "candidate_questions"
    assert meta["end_interview"] is False
    assert should_end_live_interview(session, meta) is False


def test_answer_after_candidate_questions_closes_interview():
    session = _session(
        live_state={
            "behavior_mode": "simulation",
            "interviewer_persona": "hiring_manager",
            "candidate_questions_asked": True,
            "stage": "candidate_questions",
            "themes_covered": [0, 1],
            "turn_count": 5,
        }
    )

    meta = govern_live_meta(
        session,
        {"action": "next_question"},
        candidate_answer="What does success look like in the first 90 days?",
        candidate_intent="candidate_question",
    )

    assert meta["action"] == "closing"
    assert meta["end_interview"] is True


def test_clarification_does_not_advance_question():
    session = _session(current_index=0)
    meta = govern_live_meta(
        session,
        {"action": "next_question", "question_index": 1},
        candidate_answer="Could you rephrase that?",
        candidate_intent="clarification",
    )

    apply_live_meta(session, meta)

    assert meta["action"] == "clarification"
    assert session.current_index == 0


def test_behavior_context_exposes_mode_persona_and_stage():
    session = _session(
        current_index=0,
        live_state={
            "behavior_mode": "coach",
            "interviewer_persona": "change_leader",
            "stage": "warmup",
        },
    )

    context = behavior_context(session, [])

    assert "BEHAVIOUR MODE: coach" in context
    assert "PERSONA: change_leader" in context
    assert "CURRENT STAGE: warmup" in context


def test_realtime_instructions_keep_live_turns_short_and_assessment_separate():
    instructions = build_realtime_interview_instructions(_session(), None, None, [])

    assert "under 25 words" in instructions
    assert "Ask exactly one direct question" in instructions
    assert "Do not coach, score" in instructions
    assert "call the end_interview tool" in instructions
