import tempfile
import unittest
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import inspect
from sqlmodel import Session, SQLModel, create_engine

from app.models import Profile, SocialProject, User
from app.routers.social import create_project, get_project
from app.schemas import SocialProjectCreate
from app.services.social import build_social_messages
from app import db


class SocialStudioTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        db_path = Path(self.tmp.name) / "test.db"
        self.engine = create_engine(
            f"sqlite:///{db_path}", connect_args={"check_same_thread": False}
        )
        SQLModel.metadata.create_all(self.engine)
        with Session(self.engine) as session:
            first = User(email="one@example.com", name="One")
            second = User(email="two@example.com", name="Two")
            session.add(first)
            session.add(second)
            session.commit()
            session.refresh(first)
            session.refresh(second)
            self.first_id = first.id
            self.second_id = second.id

    def tearDown(self):
        self.tmp.cleanup()

    def test_project_crud_is_user_scoped(self):
        with Session(self.engine) as session:
            first = session.get(User, self.first_id)
            second = session.get(User, self.second_id)
            project = create_project(
                SocialProjectCreate(platform="linkedin", title="Grounded post"),
                session,
                first,
            )
            loaded = get_project(project.id, session, first)
            self.assertEqual(loaded.title, "Grounded post")
            with self.assertRaises(HTTPException) as denied:
                get_project(project.id, session, second)
            self.assertEqual(denied.exception.status_code, 404)

    def test_prompt_marks_resume_as_verified_and_user_direction_as_unverified(self):
        profile = Profile(
            user_id=self.first_id,
            name="Ada Example",
            skills=["Python"],
            experience=[{"company": "Verified Co", "title": "Engineer"}],
            raw_text="Ada Example\nEngineer, Verified Co\nPython",
        )
        project = SocialProject(
            user_id=self.first_id,
            platform="medium",
            title="Article",
            settings={"tone": "practical"},
        )
        messages = build_social_messages(
            "Write about distributed systems", profile, project, []
        )
        system = messages[0]["content"]
        self.assertIn("BEGIN VERIFIED RESUME", system)
        self.assertNotIn("Verified Co", system)
        self.assertIn("[FORMER_EMPLOYER_1]", system)
        self.assertIn("Never invent or embellish", system)
        self.assertIn("unsupported by the resume", system)

    def test_social_tables_are_created_safely(self):
        migration_engine = create_engine("sqlite://")
        old_engine, old_is_sqlite = db.engine, db.is_sqlite
        try:
            db.engine = migration_engine
            db.is_sqlite = True
            db._migrate_social_studio()
            db._migrate_social_studio()
        finally:
            db.engine = old_engine
            db.is_sqlite = old_is_sqlite
        tables = set(inspect(migration_engine).get_table_names())
        self.assertIn("socialproject", tables)
        self.assertIn("socialmessage", tables)
        migration_engine.dispose()


if __name__ == "__main__":
    unittest.main()
