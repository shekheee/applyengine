from app.services import interview_practice
from app.services.live_interview import _bounded_context


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
