import json
import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine

from app.auth import create_access_token
from app.db import get_session
from app.main import app
from app.models import PrepAttempt, PrepRedo, PrepTask, User
from app.routers import prep_coach as coach_router
from app.routers.prep import put_settings
from app.schemas import PrepSettingsIn
from app.services.prep_checkpoints import BY_ID, evaluate_run, pick_task
from app.services.prep_insights import (
    CHECKLIST_NOTE,
    build_insights,
    long_term_due,
    weakest_patterns,
)
from app.services.prep_mock_interview import normalize_scorecard
from app.services.prep_schedule import build_today
from app.services.prep_seed import load_seed, sync_seed

MONDAY = date(2026, 10, 26)


def _task(task_id, pattern="Arrays", target=30, task_type="dsa", week=1, difficulty=None):
    return PrepTask(
        id=task_id,
        title=task_id,
        type=task_type,
        pattern=pattern,
        target_minutes=target,
        week=week,
        order=0,
        difficulty=difficulty,
    )


def _attempt(task_id, day, solved="yes", hint=False, minutes=20, notes=""):
    return PrepAttempt(
        user_id=1,
        task_id=task_id,
        date=day,
        solved=solved,
        hint_used=hint,
        elapsed_minutes=minutes,
        notes=notes,
    )


class PrepInsightsTests(unittest.TestCase):
    def setUp(self):
        self.tasks = [
            _task("a1", "Arrays"),
            _task("a2", "Arrays"),
            _task("g1", "Graphs"),
            _task("g2", "Graphs"),
            _task("d1", "DP"),
        ]
        self.by_id = {t.id: t for t in self.tasks}

    def test_weakest_pattern_ranks_unsolved_and_hinted_first(self):
        attempts = [
            _attempt("a1", MONDAY),
            _attempt("a2", MONDAY),
            _attempt("g1", MONDAY, solved="no"),
            _attempt("g2", MONDAY, hint=True, minutes=50),
            # One attempt is not enough to rank a pattern.
            _attempt("d1", MONDAY, solved="no"),
        ]
        weakest = weakest_patterns(self.by_id, attempts)
        self.assertEqual([w["name"] for w in weakest], ["Graphs"])
        self.assertEqual(weakest[0]["solved_rate"], 0.5)
        self.assertEqual(weakest[0]["hint_rate"], 0.5)

    def test_checklist_ticks_carry_no_signal(self):
        attempts = [
            _attempt("g1", MONDAY, solved="no"),
            _attempt("g2", MONDAY, minutes=0, notes=CHECKLIST_NOTE),
        ]
        insights = build_insights(self.tasks, attempts, [], MONDAY)
        self.assertEqual(insights["totals"]["attempts"], 1)
        self.assertEqual(insights["by_pattern"][0]["attempts"], 1)

    def test_long_term_review_is_clean_old_work_without_open_redos(self):
        old = MONDAY - timedelta(days=31)
        attempts = [
            _attempt("a1", old),
            _attempt("a2", old - timedelta(days=2)),
            _attempt("g1", old, hint=True),  # not clean: redos handle it
            _attempt("g2", old),
            _attempt("g2", MONDAY - timedelta(days=3)),  # seen recently
            _attempt("d1", MONDAY, minutes=20),  # today's attempt is ignored
        ]
        redos = [PrepRedo(user_id=1, task_id="a1", due_date=MONDAY, reason="x", done=False)]
        due = long_term_due(self.by_id, attempts, redos, MONDAY)
        self.assertEqual(due, ["a2"])

    def test_today_shows_one_long_term_review_item(self):
        tasks = []
        for raw in load_seed()["tasks"]:
            fields = {k: v for k, v in raw.items() if k in PrepTask.model_fields}
            fields.setdefault("order", 0)
            tasks.append(PrepTask(**fields))
        dsa = next(t for t in tasks if t.type == "dsa" and t.week == 1)
        today = MONDAY + timedelta(days=40)
        attempt = _attempt(dsa.id, MONDAY + timedelta(days=1), minutes=10)
        plan = build_today(tasks, MONDAY, today, [attempt], [])
        self.assertEqual([i["task_id"] for i in plan["review"]], [dsa.id])
        self.assertEqual(plan["review"][0]["badge"], "Review · 30d")
        self.assertIn("focus_pattern", plan)


class PrepCheckpointRuleTests(unittest.TestCase):
    def test_pick_prefers_unseen_then_least_recent(self):
        tasks = [
            _task("m1", difficulty="medium", week=1),
            _task("m2", difficulty="medium", week=2),
            _task("h1", difficulty="hard", week=1),
        ]
        checkpoint = BY_ID["cp-unseen-medium"]
        self.assertEqual(pick_task(checkpoint, tasks, [], 3).id, "m1")
        seen = [_attempt("m1", MONDAY)]
        self.assertEqual(pick_task(checkpoint, tasks, seen, 3).id, "m2")
        seen.append(_attempt("m2", MONDAY + timedelta(days=1)))
        self.assertEqual(pick_task(checkpoint, tasks, seen, 3).id, "m1")

    def test_clean_rule_needs_solved_no_hint_in_time(self):
        checkpoint = BY_ID["cp-unseen-medium"]
        ok = _attempt("m1", MONDAY, minutes=25)
        self.assertEqual(evaluate_run(checkpoint, ok, None, 25, None, None, None), (True, []))
        slow = _attempt("m1", MONDAY, minutes=31, hint=True)
        passed, reasons = evaluate_run(checkpoint, slow, None, 31, None, None, None)
        self.assertFalse(passed)
        self.assertEqual(len(reasons), 2)

    def test_scorecard_is_clamped_or_rejected(self):
        card = normalize_scorecard(
            {
                "communication": 9,
                "problem_solving": "3",
                "coding": 0,
                "verification": 2,
                "signal": "Lean Yes",
                "strengths": ["clear", ""],
            }
        )
        self.assertEqual(
            (card["communication"], card["coding"], card["signal"], card["score"]),
            (4, 1, "lean_yes", 3),
        )
        self.assertEqual(card["strengths"], ["clear"])
        self.assertIsNone(normalize_scorecard({"signal": "yes"}))


class FakeInterviewer:
    chat_model = "fake"
    last_model = "fake"

    def __init__(self, signal="yes"):
        self.signal = signal
        self.calls = []

    def chat_stream(self, messages, max_tokens=4096):
        self.calls.append(messages)
        yield "What is the "
        yield "complexity?"

    def chat_messages(self, messages, json_mode=False, max_tokens=4096):
        self.calls.append(messages)
        return json.dumps(
            {
                "communication": 3,
                "problem_solving": 3,
                "coding": 4,
                "verification": 3,
                "signal": self.signal,
                "summary": "Good.",
                "strengths": ["Clear narration"],
                "improvements": ["Test empty input"],
            }
        )


class PrepCoachRouterTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.engine = create_engine(
            f"sqlite:///{Path(self.tmp.name) / 'test.db'}",
            connect_args={"check_same_thread": False},
        )
        SQLModel.metadata.create_all(self.engine)
        self.today = datetime.now(timezone.utc).date()
        with Session(self.engine) as session:
            sync_seed(session)
            user = User(email="one@example.com", name="One")
            other = User(email="two@example.com", name="Two")
            session.add(user)
            session.add(other)
            session.commit()
            # Week 6, so every run checkpoint up to week 6 is open.
            put_settings(PrepSettingsIn(start_date=self.today - timedelta(days=36)), session, user)
            self.jwt = {"Authorization": f"Bearer {create_access_token(user.id)}"}
            self.other_jwt = {"Authorization": f"Bearer {create_access_token(other.id)}"}

        def override():
            with Session(self.engine) as session:
                yield session

        app.dependency_overrides[get_session] = override
        self.original_engine = coach_router.engine
        coach_router.engine = self.engine
        self.client = TestClient(app)

    def tearDown(self):
        coach_router.engine = self.original_engine
        app.dependency_overrides.clear()
        self.tmp.cleanup()

    def post(self, path, body, headers=None):
        return self.client.post(path, json=body, headers=headers or self.jwt)

    def start_mock(self, task_id="lc-1", run_id=None):
        response = self.post(
            "/api/prep/mock-sessions",
            {"task_id": task_id, "date": self.today.isoformat(), "checkpoint_run_id": run_id},
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def say(self, session_id, message):
        response = self.post(
            f"/api/prep/mock-sessions/{session_id}/turn/stream",
            {"message": message, "code": "def f(): pass", "elapsed_minutes": 5},
        )
        return [
            json.loads(line[len("data: "):])
            for line in response.text.splitlines()
            if line.startswith("data: ")
        ]

    def checkpoints(self):
        return self.client.get(
            f"/api/prep/checkpoints?date={self.today.isoformat()}", headers=self.jwt
        ).json()

    def test_mock_interview_streams_scores_and_logs(self):
        started = self.start_mock()
        self.assertEqual([t["role"] for t in started["turns"]], ["interviewer"])
        fake = FakeInterviewer()
        with patch.object(coach_router, "build_coach_provider", return_value=fake):
            events = self.say(started["id"], "I'd use a hash map.")
            self.assertEqual([e["type"] for e in events], ["candidate", "token", "token", "done"])
            self.assertEqual(events[-1]["message"]["content"], "What is the complexity?")
            system = fake.calls[0][0]["content"]
            self.assertIn("never reveal", system)
            self.assertIn("def f(): pass", system)
            self.assertEqual(fake.calls[0][-1], {"role": "user", "content": "I'd use a hash map."})
            finished = self.post(
                f"/api/prep/mock-sessions/{started['id']}/finish",
                {"code": "def f(): return 1", "elapsed_minutes": 30},
            ).json()
        self.assertEqual(finished["status"], "finished")
        self.assertEqual(finished["scorecard"]["signal"], "yes")
        self.assertEqual(len(finished["turns"]), 3)
        mocks = self.client.get("/api/prep/mocks", headers=self.jwt).json()
        self.assertEqual(len(mocks), 1)
        self.assertEqual((mocks[0]["kind"], mocks[0]["score"]), ("dsa", 4))
        self.assertIn("Test empty input", mocks[0]["to_improve"])
        ended = self.say(started["id"], "one more")
        self.assertEqual(ended, [])
        other = self.client.get(f"/api/prep/mock-sessions/{started['id']}", headers=self.other_jwt)
        self.assertEqual(other.status_code, 404)

    def test_offline_mock_gives_a_placeholder_and_logs_nothing(self):
        started = self.start_mock()
        with patch.object(coach_router, "build_coach_provider", side_effect=RuntimeError("no keys")):
            events = self.say(started["id"], "hello")
            self.assertEqual(events[-1]["type"], "done")
            finished = self.post(
                f"/api/prep/mock-sessions/{started['id']}/finish", {"code": "", "elapsed_minutes": 3}
            ).json()
        self.assertTrue(finished["scorecard"]["offline"])
        self.assertIsNone(finished["mock_log_id"])
        self.assertEqual(self.client.get("/api/prep/mocks", headers=self.jwt).json(), [])

    def test_tests_checkpoint_fails_then_passes(self):
        listing = self.checkpoints()
        self.assertEqual(listing["week"], 6)
        statuses = {c["id"]: c["status"] for c in listing["checkpoints"]}
        self.assertEqual(statuses["cp-runner"], "open")
        self.assertEqual(statuses["cp-unseen-hard"], "upcoming")

        run = self.post("/api/prep/checkpoints/cp-runner/start", {"date": self.today.isoformat()}).json()
        self.assertEqual(run["task_id"], "drill-4.4")
        again = self.post("/api/prep/checkpoints/cp-runner/start", {"date": self.today.isoformat()})
        self.assertEqual(again.json()["id"], run["id"], "an open run is resumed")
        self.assertEqual(
            {c["id"]: c["status"] for c in self.checkpoints()["checkpoints"]}["cp-runner"],
            "in_progress",
        )

        attempt = self.post(
            "/api/prep/attempts",
            {"task_id": "drill-4.4", "date": self.today.isoformat(), "elapsed_minutes": 40},
        ).json()["attempt"]
        failed = self.post(
            f"/api/prep/checkpoints/runs/{run['id']}/complete",
            {"attempt_id": attempt["id"], "tests_passed": 5, "tests_total": 7},
        ).json()
        self.assertFalse(failed["passed"])
        self.assertIn("tests passed: 5/7", failed["details"]["reasons"][0])

        second = self.post("/api/prep/checkpoints/cp-runner/start", {"date": self.today.isoformat()}).json()
        self.assertNotEqual(second["id"], run["id"])
        wrong = self.post(
            f"/api/prep/checkpoints/runs/{second['id']}/complete",
            {"attempt_id": attempt["id"], "tests_passed": 7, "tests_total": 7},
        )
        self.assertTrue(wrong.json()["passed"])
        listing = self.checkpoints()
        runner = next(c for c in listing["checkpoints"] if c["id"] == "cp-runner")
        self.assertEqual(runner["status"], "passed")
        self.assertEqual(len(runner["runs"]), 2)
        lab = next(r for r in listing["readiness"] if r["track"] == "lab")
        self.assertEqual(lab["passed"], 1)
        other = self.client.get(f"/api/prep/checkpoints/runs/{run['id']}", headers=self.other_jwt)
        self.assertEqual(other.status_code, 404)

    def test_mock_checkpoint_is_graded_when_the_interview_ends(self):
        run = self.post(
            "/api/prep/checkpoints/cp-rag-design/start", {"date": self.today.isoformat()}
        ).json()
        self.assertEqual(run["task_id"], "hld-6.1")
        mismatch = self.post(
            "/api/prep/mock-sessions",
            {"task_id": "lc-1", "date": self.today.isoformat(), "checkpoint_run_id": run["id"]},
        )
        self.assertEqual(mismatch.status_code, 409)
        started = self.start_mock("hld-6.1", run["id"])
        with patch.object(
            coach_router, "build_coach_provider", return_value=FakeInterviewer("lean_yes")
        ):
            self.post(
                f"/api/prep/mock-sessions/{started['id']}/finish",
                {"code": "Shard by tenant", "elapsed_minutes": 44},
            )
        graded = self.client.get(f"/api/prep/checkpoints/runs/{run['id']}", headers=self.jwt).json()
        self.assertTrue(graded["passed"])
        self.assertEqual(graded["details"]["signal"], "lean_yes")
        mocks = self.client.get("/api/prep/mocks", headers=self.jwt).json()
        self.assertEqual(mocks[0]["kind"], "system_design")

    def test_computed_checkpoints_and_insights_endpoint(self):
        start = self.post("/api/prep/checkpoints/cp-mocks/start", {"date": self.today.isoformat()})
        self.assertEqual(start.status_code, 409)
        mocks = next(c for c in self.checkpoints()["checkpoints"] if c["id"] == "cp-mocks")
        self.assertEqual(mocks["progress"], "0/6 mocks logged")
        insights = self.client.get(
            f"/api/prep/insights?date={self.today.isoformat()}", headers=self.jwt
        ).json()
        self.assertEqual(insights["totals"]["attempts"], 0)
        self.assertEqual(insights["review_due"], [])


if __name__ == "__main__":
    unittest.main()
