import json
import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select

from app.auth import create_access_token
from app.db import get_session
from app.main import app
from app.routers import prep as prep_router
from app.models import PrepAttempt, PrepFeedback, PrepRedo, PrepTask, User
from app.routers.prep import (
    check_item,
    create_attempt,
    get_plan,
    get_settings,
    get_task,
    list_feedback,
    get_today,
    put_settings,
)
from app.schemas import PrepAttemptIn, PrepCheckIn, PrepSettingsIn
from app.services.prep_redos import new_redos, redo_reasons
from app.services.prep_schedule import build_today, program_week, streaks
from app.services.prep_seed import load_seed, sync_seed

MONDAY = date(2026, 10, 26)


def _tasks() -> list[PrepTask]:
    tasks = []
    for raw in load_seed()["tasks"]:
        fields = {k: v for k, v in raw.items() if k in PrepTask.model_fields}
        fields.setdefault("order", 0)
        tasks.append(PrepTask(**fields))
    return tasks


def _attempt(task_id: str, day: date) -> PrepAttempt:
    return PrepAttempt(user_id=1, task_id=task_id, date=day)


def _titles(items: list[dict]) -> list[str]:
    return [item["title"] for item in items]


class PrepScheduleTests(unittest.TestCase):
    def setUp(self):
        self.tasks = _tasks()

    def plan(self, today, attempts=(), redos=(), start=MONDAY):
        return build_today(self.tasks, start, today, list(attempts), list(redos))

    def test_first_monday_matches_acceptance_check(self):
        plan = self.plan(MONDAY)
        self.assertEqual(plan["week"], 1)
        self.assertEqual(_titles(plan["morning"]), ["1. Two Sum", "217. Contains Duplicate"])
        self.assertEqual(_titles(plan["evening"]), ["Python: Built-in collections"])
        self.assertEqual(plan["morning"][0]["url"], "https://leetcode.com/problems/two-sum/")
        self.assertEqual((plan["done_count"], plan["total_count"]), (0, 3))

    def test_ticked_task_stays_on_today_and_next_day_moves_on(self):
        done = [_attempt("lc-1", MONDAY), _attempt("lc-217", MONDAY)]
        today = self.plan(MONDAY, done)
        self.assertEqual([i["done"] for i in today["morning"]], [True, True])
        tomorrow = self.plan(MONDAY + timedelta(days=1), done)
        self.assertEqual(
            _titles(tomorrow["morning"]), ["242. Valid Anagram", "49. Group Anagrams"]
        )

    def test_unfinished_work_rolls_forward(self):
        tuesday = self.plan(MONDAY + timedelta(days=1))
        self.assertEqual(_titles(tuesday["morning"]), ["1. Two Sum", "217. Contains Duplicate"])
        self.assertEqual(_titles(tuesday["evening"]), ["Python: collections + heapq"])
        self.assertEqual(_titles(tuesday["carried"]), ["Python: Built-in collections"])

    def test_week_two_evening_is_next_drill(self):
        plan = self.plan(MONDAY + timedelta(days=7))
        self.assertEqual(plan["week"], 2)
        self.assertEqual([i["type"] for i in plan["evening"]], ["drill"])
        self.assertEqual(plan["evening"][0]["task_id"], "drill-4.1")

    def test_weeks_four_to_six_alternate_lld_and_hld_by_weekday(self):
        monday = self.plan(MONDAY + timedelta(days=21))
        tuesday = self.plan(MONDAY + timedelta(days=22))
        self.assertEqual([i["task_id"] for i in monday["evening"]], ["lld-5.1"])
        self.assertEqual([i["task_id"] for i in tuesday["evening"]], ["hld-6.1"])

    def test_weekend_shows_project_milestones(self):
        saturday = self.plan(MONDAY + timedelta(days=26))
        self.assertEqual([i["task_id"] for i in saturday["weekend"]], ["p1-m1"])
        friday = self.plan(MONDAY + timedelta(days=25))
        self.assertEqual(friday["weekend"], [])

    def test_weeks_nine_and_ten_use_neetcode_and_carry_leftover_dsa(self):
        day = MONDAY + timedelta(days=56)
        plan = self.plan(day)
        self.assertEqual(plan["week"], 9)
        self.assertEqual(plan["morning"][0]["task_id"], f"nc-{day.isoformat()}")
        self.assertEqual(plan["morning"][0]["url"], "https://neetcode.io/practice")
        carried_dsa = [i for i in plan["carried"] if i["type"] == "dsa"]
        self.assertEqual(len(carried_dsa), 66)

    def test_week_is_capped_and_zero_before_start(self):
        self.assertEqual(program_week(MONDAY, MONDAY - timedelta(days=1)), 0)
        self.assertEqual(program_week(MONDAY, MONDAY + timedelta(days=200)), 10)
        plan = self.plan(MONDAY - timedelta(days=3))
        self.assertEqual(plan["status"], "not_started")
        self.assertEqual(plan["days_until_start"], 3)

    def test_streak_needs_two_tasks_and_survives_an_unfinished_today(self):
        attempts = []
        for offset in range(3):
            day = MONDAY + timedelta(days=offset)
            attempts += [_attempt("lc-1", day), _attempt("lc-217", day)]
        attempts.append(_attempt("lc-242", MONDAY + timedelta(days=3)))
        result = streaks(attempts, MONDAY + timedelta(days=3))
        self.assertEqual(result["current"], 3)
        self.assertEqual(result["needed_today"], 1)
        broken = streaks(attempts, MONDAY + timedelta(days=5))
        self.assertEqual((broken["current"], broken["best"]), (0, 3))

    def test_due_redos_show_at_top_and_future_ones_do_not(self):
        due = PrepRedo(id=1, user_id=1, task_id="lc-1", due_date=MONDAY + timedelta(days=3))
        later = PrepRedo(id=2, user_id=1, task_id="lc-1", due_date=MONDAY + timedelta(days=7))
        attempts = [_attempt("lc-1", MONDAY)]
        before = self.plan(MONDAY + timedelta(days=2), attempts, [due, later])
        self.assertEqual(before["redos"], [])
        on_day = self.plan(MONDAY + timedelta(days=3), attempts, [due, later])
        self.assertEqual([i["redo_id"] for i in on_day["redos"]], [1])
        self.assertEqual(on_day["redos"][0]["badge"], "Redo")
        overdue = self.plan(MONDAY + timedelta(days=4), attempts, [due, later])
        self.assertEqual([i["redo_id"] for i in overdue["redos"]], [1])

    def test_week_strip_marks_done_partial_and_missed(self):
        attempts = [_attempt("lc-1", MONDAY), _attempt("lc-217", MONDAY)]
        attempts.append(_attempt("lc-242", MONDAY + timedelta(days=1)))
        plan = self.plan(MONDAY + timedelta(days=3), attempts)
        statuses = [d["status"] for d in plan["week_strip"]]
        self.assertEqual(
            statuses, ["done", "partial", "missed", "today", "upcoming", "upcoming", "upcoming"]
        )


class PrepRouterTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        db_path = Path(self.tmp.name) / "test.db"
        self.engine = create_engine(
            f"sqlite:///{db_path}", connect_args={"check_same_thread": False}
        )
        SQLModel.metadata.create_all(self.engine)
        self.today = datetime.now(timezone.utc).date()
        with Session(self.engine) as session:
            sync_seed(session)
            first = User(email="one@example.com", name="One")
            second = User(email="two@example.com", name="Two")
            session.add(first)
            session.add(second)
            session.commit()
            self.first_id = first.id
            self.second_id = second.id

    def tearDown(self):
        self.tmp.cleanup()

    def test_reimporting_seed_creates_no_duplicates(self):
        with Session(self.engine) as session:
            self.assertEqual(sync_seed(session), 109)
            self.assertEqual(len(session.exec(select(PrepTask)).all()), 109)

    def test_reimport_updates_changed_fields(self):
        seed = load_seed()
        changed = {**seed, "tasks": [{**seed["tasks"][0], "title": "Renamed"}]}
        with Session(self.engine) as session:
            sync_seed(session, changed)
            self.assertEqual(session.get(PrepTask, "lc-1").title, "Renamed")
            self.assertEqual(len(session.exec(select(PrepTask)).all()), 109)

    def test_today_is_unconfigured_until_start_date_is_set(self):
        with Session(self.engine) as session:
            user = session.get(User, self.first_id)
            self.assertFalse(get_settings(session, user).configured)
            self.assertFalse(get_today(self.today, session, user).configured)
            put_settings(PrepSettingsIn(start_date=self.today), session, user)
            today = get_today(self.today, session, user)
            self.assertTrue(today.configured)
            self.assertEqual(
                [i.title for i in today.morning], ["1. Two Sum", "217. Contains Duplicate"]
            )

    def test_tick_and_untick_round_trip(self):
        with Session(self.engine) as session:
            user = session.get(User, self.first_id)
            put_settings(PrepSettingsIn(start_date=self.today), session, user)
            ticked = check_item(
                PrepCheckIn(task_id="lc-1", date=self.today, done=True), session, user
            )
            self.assertTrue(ticked.morning[0].done)
            self.assertEqual(ticked.streak.today_count, 1)
            again = check_item(
                PrepCheckIn(task_id="lc-1", date=self.today, done=True), session, user
            )
            self.assertEqual(again.streak.today_count, 1)
            unticked = check_item(
                PrepCheckIn(task_id="lc-1", date=self.today, done=False), session, user
            )
            self.assertFalse(unticked.morning[0].done)

    def test_ticking_a_redo_clears_it_and_it_stays_ticked(self):
        with Session(self.engine) as session:
            user = session.get(User, self.first_id)
            put_settings(
                PrepSettingsIn(start_date=self.today - timedelta(days=3)), session, user
            )
            redo = PrepRedo(user_id=user.id, task_id="lc-1", due_date=self.today)
            session.add(redo)
            session.commit()
            plan = check_item(
                PrepCheckIn(task_id="lc-1", date=self.today, done=True, redo_id=redo.id),
                session,
                user,
            )
            self.assertEqual(len(plan.redos), 1)
            self.assertTrue(plan.redos[0].done)
            session.refresh(redo)
            self.assertTrue(redo.done)
            self.assertEqual(redo.completed_on, self.today)

    def test_data_is_scoped_to_the_signed_in_user(self):
        with Session(self.engine) as session:
            first = session.get(User, self.first_id)
            second = session.get(User, self.second_id)
            put_settings(PrepSettingsIn(start_date=self.today), session, first)
            check_item(PrepCheckIn(task_id="lc-1", date=self.today, done=True), session, first)
            redo = PrepRedo(user_id=first.id, task_id="lc-1", due_date=self.today)
            session.add(redo)
            session.commit()

            self.assertFalse(get_settings(session, second).configured)
            put_settings(PrepSettingsIn(start_date=self.today), session, second)
            theirs = get_today(self.today, session, second)
            self.assertFalse(theirs.morning[0].done)
            self.assertEqual(theirs.redos, [])
            with self.assertRaises(HTTPException) as denied:
                check_item(
                    PrepCheckIn(task_id="lc-1", date=self.today, done=True, redo_id=redo.id),
                    session,
                    second,
                )
            self.assertEqual(denied.exception.status_code, 404)

    def test_writes_reject_dates_far_from_today_and_unknown_tasks(self):
        with Session(self.engine) as session:
            user = session.get(User, self.first_id)
            put_settings(PrepSettingsIn(start_date=self.today), session, user)
            with self.assertRaises(HTTPException) as stale:
                check_item(
                    PrepCheckIn(task_id="lc-1", date=self.today - timedelta(days=5), done=True),
                    session,
                    user,
                )
            self.assertEqual(stale.exception.status_code, 422)
            with self.assertRaises(HTTPException) as missing:
                check_item(
                    PrepCheckIn(task_id="nope", date=self.today, done=True), session, user
                )
            self.assertEqual(missing.exception.status_code, 404)



class PrepRedoRuleTests(unittest.TestCase):
    def attempt(self, **kwargs):
        fields = dict(user_id=1, task_id="lc-1", date=MONDAY, elapsed_minutes=20, solved="yes")
        fields.update(kwargs)
        return PrepAttempt(**fields)

    def test_clean_attempt_earns_no_redo(self):
        self.assertEqual(redo_reasons(self.attempt(), 40), [])
        self.assertEqual(new_redos(self.attempt(), 40, []), [])

    def test_each_trigger_is_named(self):
        reasons = redo_reasons(
            self.attempt(hint_used=True, elapsed_minutes=52, solved="partial"), 40
        )
        self.assertEqual(reasons, ["hint used", "over time (52 > 40 min)", "solved partially"])

    def test_exactly_on_target_is_not_over_time(self):
        self.assertEqual(redo_reasons(self.attempt(elapsed_minutes=40), 40), [])

    def test_two_redos_at_plus_three_and_plus_seven(self):
        redos = new_redos(self.attempt(hint_used=True), 40, [])
        self.assertEqual(
            [r.due_date for r in redos], [MONDAY + timedelta(days=3), MONDAY + timedelta(days=7)]
        )
        self.assertTrue(all(r.reason == "hint used" for r in redos))

    def test_offsets_come_from_seed_rules(self):
        redos = new_redos(self.attempt(solved="no"), 40, [], {"redo_offsets_days": [1]})
        self.assertEqual([r.due_date for r in redos], [MONDAY + timedelta(days=1)])

    def test_no_stacking_while_a_redo_is_still_queued(self):
        queued = PrepRedo(user_id=1, task_id="lc-1", due_date=MONDAY + timedelta(days=4))
        self.assertEqual(new_redos(self.attempt(hint_used=True), 40, [queued]), [])


class PrepAttemptRouterTests(unittest.TestCase):
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
            self.user_id = user.id
            self.other_id = other.id
            put_settings(PrepSettingsIn(start_date=self.today), session, user)

    def tearDown(self):
        self.tmp.cleanup()

    def log(self, session, user, **kwargs):
        fields = dict(task_id="lc-1", date=self.today, elapsed_minutes=25, solved="yes")
        fields.update(kwargs)
        return create_attempt(PrepAttemptIn(**fields), session, user)

    def test_hint_used_creates_two_redos_that_appear_on_their_dates(self):
        with Session(self.engine) as session:
            user = session.get(User, self.user_id)
            result = self.log(session, user, hint_used=True, code="def two_sum(): ...")
            self.assertEqual(
                [r.due_date for r in result.redos_created],
                [self.today + timedelta(days=3), self.today + timedelta(days=7)],
            )
            self.assertEqual(result.attempt.code, "def two_sum(): ...")
            for offset, expected in ((2, []), (3, ["lc-1"]), (7, ["lc-1"])):
                plan = get_today(self.today + timedelta(days=offset), session, user)
                self.assertEqual([i.task_id for i in plan.redos], expected, offset)

    def test_clean_attempt_ticks_the_checklist_without_redos(self):
        with Session(self.engine) as session:
            user = session.get(User, self.user_id)
            result = self.log(session, user, self_rating=4, complexity="O(n) time, O(n) space")
            self.assertEqual(result.redos_created, [])
            plan = get_today(self.today, session, user)
            self.assertTrue(plan.morning[0].done)
            self.assertEqual(plan.streak.today_count, 1)

    def test_logged_attempt_replaces_a_quick_tick(self):
        with Session(self.engine) as session:
            user = session.get(User, self.user_id)
            check_item(PrepCheckIn(task_id="lc-1", date=self.today, done=True), session, user)
            self.log(session, user, notes="Used a hash map")
            rows = session.exec(
                select(PrepAttempt).where(PrepAttempt.user_id == user.id)
            ).all()
            self.assertEqual([r.notes for r in rows], ["Used a hash map"])

    def test_attempt_on_due_day_clears_redo_and_failed_redo_requeues(self):
        with Session(self.engine) as session:
            user = session.get(User, self.user_id)
            due = PrepRedo(user_id=user.id, task_id="lc-1", due_date=self.today, reason="hint used")
            session.add(due)
            session.commit()
            result = self.log(session, user, solved="no")
            self.assertEqual(result.redos_cleared, 1)
            self.assertEqual(len(result.redos_created), 2)
            plan = get_today(self.today, session, user)
            self.assertEqual(len(plan.redos), 1)
            self.assertTrue(plan.redos[0].done)

    def test_failed_attempt_does_not_stack_on_a_queued_redo(self):
        with Session(self.engine) as session:
            user = session.get(User, self.user_id)
            self.assertEqual(len(self.log(session, user, hint_used=True).redos_created), 2)
            self.assertEqual(len(self.log(session, user, hint_used=True).redos_created), 0)

    def test_neetcode_attempt_needs_a_problem_name(self):
        with Session(self.engine) as session:
            user = session.get(User, self.user_id)
            nc = f"nc-{self.today.isoformat()}"
            with self.assertRaises(HTTPException) as unnamed:
                self.log(session, user, task_id=nc)
            self.assertEqual(unnamed.exception.status_code, 422)
            result = self.log(session, user, task_id=nc, title="Koko Eating Bananas")
            self.assertEqual(result.attempt.title, "Koko Eating Bananas")
            detail = get_task(nc, None, session, user)
            self.assertTrue(detail.synthetic)
            self.assertEqual(detail.title, "Koko Eating Bananas")
            with self.assertRaises(HTTPException) as future:
                self.log(
                    session,
                    user,
                    task_id=f"nc-{(self.today + timedelta(days=9)).isoformat()}",
                    title="x",
                )
            self.assertEqual(future.exception.status_code, 404)

    def test_task_detail_carries_spec_history_and_rules(self):
        with Session(self.engine) as session:
            user = session.get(User, self.user_id)
            lld = get_task("lld-5.1", None, session, user)
            self.assertIn("rollback", lld.spec)
            self.assertTrue(lld.editor)
            hld = get_task("hld-6.1", None, session, user)
            self.assertEqual(hld.framework[0], "Clarify (5)")
            self.log(session, user, hint_used=True)
            dsa = get_task("lc-1", None, session, user)
            self.assertEqual(len(dsa.attempts), 1)
            self.assertEqual(len(dsa.open_redos), 2)
            self.assertEqual(dsa.rules["redo_offsets_days"], [3, 7])
            with self.assertRaises(HTTPException):
                get_task("missing", None, session, user)

    def test_attempts_and_redos_are_private(self):
        with Session(self.engine) as session:
            user = session.get(User, self.user_id)
            other = session.get(User, self.other_id)
            self.log(session, user, hint_used=True)
            theirs = get_task("lc-1", None, session, other)
            self.assertEqual((theirs.attempts, theirs.open_redos), ([], []))


class PrepPlanTests(unittest.TestCase):
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
            self.user_id = user.id
            self.other_id = other.id

    def tearDown(self):
        self.tmp.cleanup()

    def test_plan_lists_all_weeks_and_tasks_before_setup(self):
        with Session(self.engine) as session:
            plan = get_plan(self.today, session, session.get(User, self.user_id))
            self.assertFalse(plan.configured)
            self.assertEqual([w.week for w in plan.weeks], list(range(1, 11)))
            self.assertEqual(sum(len(w.tasks) for w in plan.weeks), 109)
            self.assertEqual(plan.weeks[0].tasks[0].title, "1. Two Sum")

    def test_plan_status_reflects_attempts_and_queued_redos(self):
        with Session(self.engine) as session:
            user = session.get(User, self.user_id)
            put_settings(PrepSettingsIn(start_date=self.today), session, user)
            create_attempt(
                PrepAttemptIn(task_id="lc-1", date=self.today, elapsed_minutes=20), session, user
            )
            create_attempt(
                PrepAttemptIn(
                    task_id="lc-217", date=self.today, elapsed_minutes=50, hint_used=True
                ),
                session,
                user,
            )
            plan = get_plan(self.today, session, user)
            week1 = {t.task_id: t for t in plan.weeks[0].tasks}
            self.assertEqual(week1["lc-1"].status, "done")
            self.assertEqual(week1["lc-217"].status, "redo")
            self.assertEqual(week1["lc-217"].next_redo, (self.today + timedelta(days=3)).isoformat())
            self.assertTrue(week1["lc-217"].last_hint)
            self.assertEqual(week1["lc-242"].status, "todo")
            self.assertEqual(plan.weeks[0].done, 2)
            self.assertEqual(plan.current_week, 1)

            other = get_plan(self.today, session, session.get(User, self.other_id))
            self.assertTrue(all(t.status == "todo" for w in other.weeks for t in w.tasks))

    def test_neetcode_attempts_appear_under_their_week(self):
        with Session(self.engine) as session:
            user = session.get(User, self.user_id)
            put_settings(
                PrepSettingsIn(start_date=self.today - timedelta(days=60)), session, user
            )
            create_attempt(
                PrepAttemptIn(
                    task_id=f"nc-{self.today.isoformat()}",
                    date=self.today,
                    title="Koko Eating Bananas",
                    elapsed_minutes=30,
                ),
                session,
                user,
            )
            plan = get_plan(self.today, session, user)
            self.assertEqual(plan.current_week, 9)
            self.assertEqual([t.title for t in plan.weeks[8].tasks], ["Koko Eating Bananas"])

    def test_feedback_history_is_newest_first_and_private(self):
        with Session(self.engine) as session:
            user = session.get(User, self.user_id)
            for offset in (2, 1):
                session.add(
                    PrepFeedback(
                        user_id=user.id,
                        date=self.today - timedelta(days=offset),
                        markdown=f"day -{offset}",
                    )
                )
            session.commit()
            history = list_feedback(30, session, user)
            self.assertEqual([f.markdown for f in history], ["day -1", "day -2"])
            self.assertEqual(list_feedback(30, session, session.get(User, self.other_id)), [])


class PrepReviewLoopTests(unittest.TestCase):
    """The nightly script's path: review token -> daily log -> feedback upload."""

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
            self.user_id = user.id
            self.other_id = other.id
            put_settings(PrepSettingsIn(start_date=self.today), session, user)
            put_settings(PrepSettingsIn(start_date=self.today), session, other)

        def override():
            with Session(self.engine) as session:
                yield session

        app.dependency_overrides[get_session] = override
        self.client = TestClient(app)
        self.jwt = {"Authorization": f"Bearer {create_access_token(self.user_id)}"}
        self.other_jwt = {"Authorization": f"Bearer {create_access_token(self.other_id)}"}

    def tearDown(self):
        app.dependency_overrides.clear()
        self.tmp.cleanup()

    def issue_token(self, headers=None):
        response = self.client.post("/api/prep/review-token", headers=headers or self.jwt)
        self.assertEqual(response.status_code, 200)
        token = response.json()["token"]
        self.assertTrue(token.startswith("prep_"))
        return {"Authorization": f"Bearer {token}"}

    def test_token_is_shown_once_and_reissuing_revokes_the_old_one(self):
        first = self.issue_token()
        status = self.client.get("/api/prep/review-token", headers=self.jwt).json()
        self.assertTrue(status["exists"])
        self.assertIsNone(status["token"])
        self.assertTrue(status["created_at"].endswith(("Z", "+00:00")))
        second = self.issue_token()
        day = self.today.isoformat()
        self.assertEqual(self.client.get(f"/api/prep/log?date={day}", headers=first).status_code, 401)
        self.assertEqual(self.client.get(f"/api/prep/log?date={day}", headers=second).status_code, 200)
        self.client.delete("/api/prep/review-token", headers=self.jwt)
        self.assertEqual(self.client.get(f"/api/prep/log?date={day}", headers=second).status_code, 401)

    def test_review_token_only_reaches_log_and_feedback(self):
        token = self.issue_token()
        day = self.today.isoformat()
        self.assertEqual(self.client.get(f"/api/prep/today?date={day}", headers=token).status_code, 401)
        self.assertEqual(self.client.get("/api/prep/settings", headers=token).status_code, 401)
        self.assertEqual(self.client.post("/api/prep/review-token", headers=token).status_code, 401)
        self.assertEqual(self.client.get("/api/auth/me", headers=token).status_code, 401)

    def test_daily_log_has_plan_attempts_code_redos_and_totals(self):
        with Session(self.engine) as session:
            user = session.get(User, self.user_id)
            create_attempt(
                PrepAttemptIn(
                    task_id="lc-1",
                    date=self.today,
                    elapsed_minutes=48,
                    hint_used=True,
                    code="def two_sum(nums, target): ...",
                    notes="Forgot the complement trick",
                    complexity="O(n) time",
                ),
                session,
                user,
            )
        token = self.issue_token()
        log = self.client.get(f"/api/prep/log?date={self.today.isoformat()}", headers=token).json()
        self.assertEqual(log["week"], 1)
        self.assertEqual(
            [(p["task_id"], p["done"]) for p in log["planned"]][:2],
            [("lc-1", True), ("lc-217", False)],
        )
        attempt = log["attempts"][0]
        self.assertEqual(attempt["code"], "def two_sum(nums, target): ...")
        self.assertEqual(attempt["notes"], "Forgot the complement trick")
        self.assertTrue(attempt["hint_used"])
        self.assertEqual(attempt["target_minutes"], 40)
        self.assertEqual(log["streak"]["today_count"], 1)
        self.assertEqual(log["totals"]["week_done"], 1)
        self.assertEqual(log["totals"]["week_planned"], 16)
        later = (self.today + timedelta(days=3)).isoformat()
        later_log = self.client.get(f"/api/prep/log?date={later}", headers=token).json()
        self.assertEqual([r["task_id"] for r in later_log["redos_due_or_overdue"]], ["lc-1"])

    def test_feedback_upload_shows_next_day_and_rerun_replaces_it(self):
        token = self.issue_token()
        day = self.today.isoformat()
        first = self.client.put(
            f"/api/prep/feedback/{day}", content="# Verdict\nGood day.", headers=token
        )
        self.assertEqual(first.status_code, 200)
        rerun = self.client.put(
            f"/api/prep/feedback/{day}", content="# Verdict\nRe-run.", headers=token
        )
        self.assertEqual(rerun.status_code, 200)
        history = self.client.get("/api/prep/feedback", headers=self.jwt).json()
        self.assertEqual([h["markdown"] for h in history], ["# Verdict\nRe-run."])
        tomorrow = (self.today + timedelta(days=1)).isoformat()
        today_screen = self.client.get(f"/api/prep/today?date={tomorrow}", headers=self.jwt).json()
        self.assertEqual(today_screen["feedback"]["markdown"], "# Verdict\nRe-run.")
        self.assertEqual(
            self.client.put(f"/api/prep/feedback/{day}", content="  ", headers=token).status_code,
            422,
        )

    def test_tokens_are_per_user(self):
        mine = self.issue_token()
        self.client.put(f"/api/prep/feedback/{self.today.isoformat()}", content="mine", headers=mine)
        self.assertEqual(self.client.get("/api/prep/feedback", headers=self.other_jwt).json(), [])
        theirs = self.issue_token(self.other_jwt)
        self.assertNotEqual(mine, theirs)
        self.assertEqual(
            self.client.get("/api/prep/feedback", headers=self.jwt).json()[0]["markdown"], "mine"
        )


CONTENT = {
    "lc-1": {
        "brief": "Hash map warm-up.",
        "hints": ["Think about lookups.", "Store what you have seen.", "Map value to index."],
        "solution": "Use a dict of complements.",
    },
    "py-mon": {
        "brief": "Collections practice.",
        "starter": "def group(words):\n    raise NotImplementedError\n",
        "tests": [{"name": "groups", "code": "assert group(['a']) == {'a': ['a']}"}],
        "hints": ["One", "Two", "Three"],
        "solution": "Use defaultdict(list).",
    },
}


class FakeTutor:
    chat_model = "fake-tutor"
    last_model = "fake-tutor"

    def __init__(self):
        self.calls = []

    def chat_stream(self, messages, max_tokens=4096):
        self.calls.append(messages)
        yield "### Verdict\n"
        yield "Solid."


class PrepContentAndTutorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.engine = create_engine(
            f"sqlite:///{Path(self.tmp.name) / 'test.db'}",
            connect_args={"check_same_thread": False},
        )
        SQLModel.metadata.create_all(self.engine)
        self.today = datetime.now(timezone.utc).date()
        with Session(self.engine) as session:
            sync_seed(session, content=CONTENT)
            user = User(email="one@example.com", name="One")
            other = User(email="two@example.com", name="Two")
            session.add(user)
            session.add(other)
            session.commit()
            self.user_id = user.id
            self.other_id = other.id
            put_settings(PrepSettingsIn(start_date=self.today), session, user)

        def override():
            with Session(self.engine) as session:
                yield session

        app.dependency_overrides[get_session] = override
        self.original_engine = prep_router.engine
        prep_router.engine = self.engine
        self.client = TestClient(app)
        self.jwt = {"Authorization": f"Bearer {create_access_token(self.user_id)}"}
        self.other_jwt = {"Authorization": f"Bearer {create_access_token(self.other_id)}"}

    def tearDown(self):
        prep_router.engine = self.original_engine
        app.dependency_overrides.clear()
        self.tmp.cleanup()

    def detail(self, task_id="lc-1", headers=None):
        return self.client.get(
            f"/api/prep/tasks/{task_id}?date={self.today.isoformat()}",
            headers=headers or self.jwt,
        ).json()

    def reveal(self, task_id="lc-1", headers=None):
        return self.client.post(
            f"/api/prep/tasks/{task_id}/hints",
            json={"date": self.today.isoformat()},
            headers=headers or self.jwt,
        )

    def log(self, **kwargs):
        body = {"task_id": "lc-1", "date": self.today.isoformat(), "elapsed_minutes": 20}
        body.update(kwargs)
        response = self.client.post("/api/prep/attempts", json=body, headers=self.jwt)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def stream(self, attempt_id, message=""):
        response = self.client.post(
            f"/api/prep/attempts/{attempt_id}/tutor/stream",
            json={"message": message},
            headers=self.jwt,
        )
        events = [
            json.loads(line[len("data: "):])
            for line in response.text.splitlines()
            if line.startswith("data: ")
        ]
        return response.status_code, events

    def test_seed_sync_merges_authored_content(self):
        with Session(self.engine) as session:
            task = session.get(PrepTask, "py-mon")
            self.assertEqual(task.brief, "Collections practice.")
            self.assertEqual(task.tests[0]["name"], "groups")
            self.assertIsNone(session.get(PrepTask, "lc-217").hints)
        detail = self.detail("py-mon")
        self.assertIn("NotImplementedError", detail["starter"])
        self.assertEqual(detail["hints_total"], 3)
        self.assertEqual(detail["hints_revealed"], [])

    def test_hints_reveal_in_order_and_cap_at_three(self):
        self.assertEqual(self.reveal().json()["revealed"], ["Think about lookups."])
        self.reveal()
        third = self.reveal().json()
        self.assertEqual(third["revealed"][-1], "Map value to index.")
        self.assertEqual(len(self.reveal().json()["revealed"]), 3)
        self.assertEqual(len(self.detail()["hints_revealed"]), 3)
        self.assertEqual(self.detail(headers=self.other_jwt)["hints_revealed"], [])
        self.assertEqual(self.reveal("lc-217").status_code, 404)

    def test_revealed_hint_forces_hint_used_and_schedules_redos(self):
        self.reveal()
        result = self.log(hint_used=False)
        self.assertTrue(result["attempt"]["hint_used"])
        self.assertEqual(len(result["redos_created"]), 2)

    def test_solution_unlocks_after_an_attempt(self):
        locked = self.detail()
        self.assertIsNone(locked["solution"])
        self.assertTrue(locked["solution_locked"])
        self.log()
        unlocked = self.detail()
        self.assertEqual(unlocked["solution"], "Use a dict of complements.")
        self.assertFalse(unlocked["solution_locked"])

    def test_tutor_reviews_then_answers_and_saves_the_thread(self):
        attempt_id = self.log(code="def two_sum(): ...", notes="used a dict")["attempt"]["id"]
        fake = FakeTutor()
        with patch.object(prep_router, "build_coach_provider", return_value=fake):
            self.assertEqual(self.stream(attempt_id, "why?")[0], 409)
            status, events = self.stream(attempt_id)
            self.assertEqual(status, 200)
            self.assertEqual([e["type"] for e in events], ["token", "token", "done"])
            self.assertEqual(events[-1]["message"]["content"], "### Verdict\nSolid.")
            context = fake.calls[0][1]["content"]
            self.assertIn("def two_sum(): ...", context)
            self.assertIn("Use a dict of complements.", context)
            self.assertEqual(self.stream(attempt_id)[0], 409)
            _, followup = self.stream(attempt_id, "Why a dict?")
            self.assertEqual(followup[-1]["type"], "done")
            self.assertEqual(fake.calls[1][-1], {"role": "user", "content": "Why a dict?"})
        thread = self.client.get(f"/api/prep/attempts/{attempt_id}/tutor", headers=self.jwt).json()
        self.assertEqual([m["role"] for m in thread], ["assistant", "user", "assistant"])
        other = self.client.get(f"/api/prep/attempts/{attempt_id}/tutor", headers=self.other_jwt)
        self.assertEqual(other.status_code, 404)

    def test_tutor_falls_back_to_the_reference_without_a_model(self):
        attempt_id = self.log()["attempt"]["id"]
        with patch.object(prep_router, "build_coach_provider", side_effect=RuntimeError("no keys")):
            _, events = self.stream(attempt_id)
        self.assertEqual(events[-1]["type"], "done")
        self.assertIn("Use a dict of complements.", events[-1]["message"]["content"])
        self.assertEqual(events[-1]["message"]["model_served"], "offline")

if __name__ == "__main__":
    unittest.main()
