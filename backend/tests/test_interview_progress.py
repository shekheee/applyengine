from app.models import InterviewSession, InterviewTurn
from app.services.interview_progress import build_interview_progress


def test_progress_clusters_wording_variants_and_aggregates_delivery():
    session = InterviewSession(
        id=7,
        user_id=1,
        status="completed",
        focus="behavioral",
        overall_score=7.5,
        questions=[{"text": "Tell me about an impact.", "category": "behavioral"}],
        recurring_weaknesses=["Use measurable outcomes in answers"],
        summary={
            "overall_score": 7.5,
            "priority_improvements": ["Your answers need measurable outcomes"],
        },
    )
    turn = InterviewTurn(
        session_id=7,
        role="candidate",
        content="I led the work.",
        scores={
            "delivery": {
                "words_per_minute": 132,
                "filler_rate_per_100": 3,
                "pause_count": 2,
            }
        },
    )

    progress = build_interview_progress([session], {7: [turn]})

    assert progress["recurring_themes"][0]["count"] == 2
    assert progress["delivery_averages"] == {
        "words_per_minute": 132.0,
        "filler_rate_per_100": 3.0,
        "pause_count": 2.0,
    }


def test_progress_does_not_double_count_summary_topic_scores():
    session = InterviewSession(
        id=8,
        user_id=1,
        status="completed",
        curriculum_topic="rag",
        questions=[{"text": "How would you evaluate retrieval?", "category": "rag"}],
        summary={"overall_score": 8, "topic_scores": {"rag": 8}},
    )
    feedback = InterviewTurn(
        session_id=8,
        question_index=0,
        role="feedback",
        content="Good answer",
        scores={"overall_score": 2},
    )

    progress = build_interview_progress([session], {8: [feedback]})

    assert progress["topic_averages"]["rag"] == 8.0
