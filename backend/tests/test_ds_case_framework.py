import tempfile
from pathlib import Path

from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select

from app.auth import get_current_user
from app.db import get_session
from app.main import app
from app.models import InterviewSession, InterviewTurn, Profile, User
from app.routers import interview
from app.services import interview_practice
from app.services.ds_case_framework import (
    CASE_BANK,
    CASE_BY_ID,
    FRAMEWORK_STEPS,
    analyse_case_text,
    analyze_case_transcript,
    build_case_scorecard,
    case_prompt_block,
    case_questions,
    split_transcript,
    structure_signals,
    value_sizing_check,
)
from app.services.speech import analyze_delivery

STRONG_ANSWER = """Before I start, what is the main objective — waste or availability?
How do store managers order today? Let me assume fresh sales of about €1.2B.
I'll structure this in three parts: first, framing; second, data; third, evaluation.
I'd frame it as a probabilistic forecast at SKU x store x day granularity; the target is units sold.
Data: POS transactions, deliveries, promo calendar and weather; watch for leakage and censored demand.
I'd start with a seasonal naive baseline, then LightGBM because it handles promo and price interactions.
Evaluate with WAPE on a time-based backtest plus the business metric waste %, then a pilot in 20 stores vs control stores.
Deploy through an API into the ordering system, monitor drift, retrain weekly, and train store managers so adoption sticks.
Does that make sense so far? To summarise: I recommend a 20-store pilot.
Impact: €1.2B sales × 2% less waste × 70% cost of goods ≈ €17M a year. The main risk is trust."""

WEAK_ANSWER = "I would train a neural network on all the data; it will be very accurate and save a lot."


class _FakeChain:
    last_served = "fake"
    last_model = "fake"

    def __init__(self, payload):
        self.payload = payload

    def chat_json(self, system, user):
        self.system, self.user = system, user
        return self.payload


def test_case_bank_has_the_five_cases_with_facts_and_sizing():
    assert {c.id for c in CASE_BANK} == {
        "grocery_fresh_waste",
        "beauty_mmm",
        "telecom_churn_uplift",
        "bank_genai_agent_assist",
        "fashion_homepage_personalisation",
    }
    for case in CASE_BANK:
        assert len(case.facts) >= 5
        assert "×" in case.value_sizing
        assert case.pushbacks


def test_case_questions_walk_the_seven_steps_in_order():
    questions = case_questions(CASE_BY_ID["telecom_churn_uplift"])

    assert [q["category"] for q in questions] == [s.id for s in FRAMEWORK_STEPS]
    assert questions[0]["text"].startswith(CASE_BY_ID["telecom_churn_uplift"].prompt)
    assert [q["id"] for q in questions] == list(range(7))


def test_interviewer_brief_withholds_facts_until_asked():
    brief = case_prompt_block(CASE_BY_ID["beauty_mmm"], for_interviewer=True)

    assert "reveal a fact ONLY when the candidate asks" in brief
    assert "Do not volunteer facts" in brief
    assert "€50M" in brief


def test_strong_answer_covers_framework_and_sizing():
    result = analyse_case_text(STRONG_ANSWER)
    scores = {s["step"]: s["score"] for s in result["steps"]}

    assert all(score >= 2 for score in scores.values()), scores
    assert result["framework_score"] >= 8
    assert result["value_sizing"]["status"] == "complete"
    assert not any("value sizing" in f.lower() for f in result["flags"])


def test_weak_answer_flags_missing_sizing_and_baseline():
    result = analyse_case_text(WEAK_ANSWER)

    assert result["value_sizing"]["status"] == "missing"
    assert result["flags"][0].startswith("Missing value sizing")
    assert "No baseline before the main model." in result["flags"]
    assert result["framework_score"] < 3


def test_value_sizing_names_the_missing_term():
    partial = value_sizing_check("We could cut waste by 2% on €1.2B of sales, worth roughly €24M.")

    assert partial["status"] == "partial"
    assert partial["missing"] == ["margin"]
    assert value_sizing_check("It will save a lot of money.")["status"] == "missing"


def test_structure_signals_count_each_habit():
    text = (
        "Could I ask what the KPI is? Who owns the decision today? "
        "Let's assume 2 million customers. Does that make sense? "
        "To recap, we have the target and the data."
    )
    signals = structure_signals(text)

    assert signals["clarifying_questions"]["count"] == 2
    assert signals["check_ins"]["count"] == 1
    assert signals["assumptions"]["count"] == 1
    assert signals["summaries"]["count"] == 1


def test_llm_step_scores_win_and_bad_rows_are_ignored():
    result = analyse_case_text(
        WEAK_ANSWER,
        [
            {"step": "approach", "score": 3, "evidence": "uses a baseline"},
            {"step": "made_up", "score": 3},
            {"step": "data", "score": "not a number"},
        ],
    )
    by_step = {s["step"]: s for s in result["steps"]}

    assert by_step["approach"]["score"] == 3
    assert by_step["approach"]["source"] == "llm"
    assert by_step["data"]["source"] == "heuristic"


def test_scorecard_takes_best_step_evidence_across_turns():
    card = build_case_scorecard(
        CASE_BY_ID["grocery_fresh_waste"],
        [WEAK_ANSWER],
        per_turn_steps=[
            [{"step": "clarify", "score": 1}],
            [{"step": "clarify", "score": 3}],
        ],
        deliveries=[
            {"word_count": 300, "filler_count": 30, "words_per_minute": 200, "duration_seconds": 90,
             "filler_breakdown": {"um": 20, "like": 10}},
        ],
    )

    assert {s["step"]: s["score"] for s in card["steps"]}["clarify"] == 3
    assert card["delivery"]["words_per_minute"] == 200
    assert "faster than" in card["delivery"]["feedback"][0]
    assert "um" in card["delivery"]["feedback"][1]


def test_transcript_split_ignores_interviewer_and_reads_timestamps():
    transcript = (
        "[00:00] Interviewer: A grocer wastes 8% of fresh food.\n"
        "[00:10] Me: Could I ask how they order today?\n"
        "[02:10] Interviewer: Store managers use a moving average.\n"
        "[02:30] Me: So, um, I would start with a baseline."
    )
    parts = split_transcript(transcript)

    assert parts["interviewer_lines"] == 2
    assert "8%" not in parts["candidate_text"]
    # Only "Me" lines are timed: 00:10→02:10 (120s for 7 words); the last line is scaled in.
    assert parts["timestamp_duration_seconds"] == round(120 * 15 / 7, 1)

    result = analyze_case_transcript(CASE_BY_ID["grocery_fresh_waste"], transcript)
    assert result["duration_source"] == "timestamps"
    assert result["delivery"]["filler_breakdown"]["so (sentence opener)"] == 1


def test_untimed_transcript_reports_no_pace():
    delivery = analyze_delivery("So, I'd start here. Right, the data next.", 0)

    assert delivery["words_per_minute"] == 0
    assert delivery["filler_breakdown"] == {"so (sentence opener)": 1, "right (sentence opener)": 1}
    assert not any("Pace" in o for o in delivery["observations"])


def test_mid_sentence_so_is_not_a_filler():
    delivery = analyze_delivery("It was so important that we checked.", 5)

    assert delivery["filler_count"] == 0


def test_case_feedback_adds_scorecard_and_clarification_answers(monkeypatch):
    chain = _FakeChain(
        {
            "overall_score": 6,
            "clarification_answers": [
                {"question": "How many stores?", "answer": "420 stores across three countries"}
            ],
        }
    )
    monkeypatch.setattr(interview_practice, "_chain", lambda model_id: chain)
    prior = [InterviewTurn(session_id=1, role="candidate", content="What is the KPI? How do they order today?")]

    fb = interview_practice.evaluate_answer(
        "Walk me through your modelling approach.",
        "I'd start with a moving-average baseline, then LightGBM because it handles promos.",
        None,
        None,
        prior,
        3,
        case_id="grocery_fresh_waste",
        question_category="approach",
    )

    assert "CASE FACTS" in chain.user
    assert "THIS ANSWER targets step 4" in chain.user
    steps = {s["step"]: s["score"] for s in fb["case_scorecard"]["steps"]}
    assert steps["clarify"] >= 2  # credit from the earlier answer carries over
    assert steps["approach"] == 3
    md = interview_practice.feedback_to_markdown(fb)
    assert "### Case framework" in md
    assert "420 stores" in md
    assert "Value sizing" in md


def test_case_session_api_uses_fixed_steps_and_case_partner(monkeypatch):
    tmp = tempfile.TemporaryDirectory()
    engine = create_engine(
        f"sqlite:///{Path(tmp.name) / 'case.db'}", connect_args={"check_same_thread": False}
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as db:
        user = User(email="case@example.test", name="Case Test")
        db.add(user)
        db.commit()
        db.refresh(user)
        user_id = user.id

    def session_override():
        with Session(engine) as db:
            yield db

    def fail_if_called(*args, **kwargs):
        raise AssertionError("case sessions should not generate questions with an LLM")

    monkeypatch.setattr(interview, "generate_questions", fail_if_called)
    monkeypatch.setattr(
        interview, "get_base_profile", lambda user, db: Profile(user_id=user_id, name="Case Test")
    )
    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[get_current_user] = lambda: User(id=user_id, email="case@example.test")
    try:
        client = TestClient(app)
        bank = client.get("/api/interview/cases").json()
        assert len(bank["framework"]) == 7 and len(bank["cases"]) == 5

        res = client.post(
            "/api/interview/sessions",
            json={"case_id": "bank_genai_agent_assist", "mode": "live", "interviewer_persona": "case_partner"},
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["focus"] == "case_study"
        assert body["live_state"]["case_id"] == "bank_genai_agent_assist"
        assert len(body["questions"]) == 7
        assert body["title"].startswith("Case · ")

        bad = client.post("/api/interview/sessions", json={"case_id": "nope"})
        assert bad.status_code == 422

        scored = client.post(
            "/api/interview/cases/analyze-transcript",
            json={"case_id": "beauty_mmm", "transcript": STRONG_ANSWER, "duration_seconds": 240},
        )
        assert scored.status_code == 200, scored.text
        assert scored.json()["duration_source"] == "provided"
        assert scored.json()["case_scorecard"]["case_id"] == "beauty_mmm"

        with Session(engine) as db:
            saved = db.exec(select(InterviewSession)).one()
            assert saved.live_state["interviewer_persona"] == "case_partner"
    finally:
        app.dependency_overrides.clear()
        engine.dispose()
        tmp.cleanup()


def test_session_summary_attaches_case_scorecard(monkeypatch):
    chain = _FakeChain({"overall_score": 7, "framework_steps": [{"step": "deployment", "score": 2}]})
    chain.reset = lambda: None
    monkeypatch.setattr(interview_practice, "_chain", lambda model_id: chain)
    session = InterviewSession(
        user_id=1,
        mode="text",
        questions=case_questions(CASE_BY_ID["fashion_homepage_personalisation"]),
        live_state={"case_id": "fashion_homepage_personalisation"},
    )
    turns = [InterviewTurn(session_id=1, role="candidate", content=STRONG_ANSWER)]

    summary = interview_practice.generate_summary(session, turns, None, None)

    card = summary["case_scorecard"]
    assert card["case_id"] == "fashion_homepage_personalisation"
    assert {s["step"]: s["score"] for s in card["steps"]}["deployment"] == 2
    assert "### Case framework" in interview_practice.summary_to_markdown(summary)


def test_early_steps_are_not_penalised_for_steps_not_reached_yet():
    first_answer = (
        "What is the main objective? How do store managers order today? "
        "Let me assume the KPI is waste %. Does that framing work for you?"
    )
    result = analyse_case_text(first_answer, steps_due=1)

    assert result["steps_due"] == 1
    assert result["framework_score"] >= 6
    assert not any("not covered" in f for f in result["flags"])
    assert not any("value sizing" in f.lower() for f in result["flags"])
    assert result["value_sizing"]["due"] is False
    md = interview_practice.case_scorecard_markdown(result)
    assert "(steps 1–1 so far)" in md
    assert "| later |" in md
    assert "Value sizing:** not yet" in md


def test_check_in_with_a_noun_is_not_a_clarifying_question():
    signals = structure_signals("Does that framing work for you? Are we aligned on the KPI?")

    assert signals["check_ins"]["count"] == 2
    assert signals["clarifying_questions"]["count"] == 0


def test_feedback_keeps_step_credit_from_earlier_answers(monkeypatch):
    chain = _FakeChain({"framework_steps": [{"step": "clarify", "score": 1}, {"step": "frame", "score": 3}]})
    monkeypatch.setattr(interview_practice, "_chain", lambda model_id: chain)
    prior = [
        InterviewTurn(session_id=1, role="candidate", content="What is the KPI?"),
        InterviewTurn(
            session_id=1,
            role="feedback",
            scores={"framework_steps": [{"step": "clarify", "score": 2, "evidence": "asked for KPI"}]},
        ),
    ]

    fb = interview_practice.evaluate_answer(
        "Frame it", "A forecast at SKU x store x day.", None, None, prior, 1,
        case_id="grocery_fresh_waste", question_category="frame",
    )

    steps = {s["step"]: s for s in fb["case_scorecard"]["steps"]}
    assert steps["clarify"]["score"] == 2
    assert steps["clarify"]["evidence"] == "asked for KPI"
    assert steps["frame"]["score"] == 3
