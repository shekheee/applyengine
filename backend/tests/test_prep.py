import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine, select

from app.models import PrepAttempt, PrepRedo, PrepTask, User
from app.routers.prep import check_item, get_settings, get_today, put_settings
from app.schemas import PrepCheckIn, PrepSettingsIn
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


if __name__ == "__main__":
    unittest.main()
