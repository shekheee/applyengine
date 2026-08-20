import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select

from app.auth import get_current_user
from app.db import get_session
from app.main import app
from app.models import BuddySession, ChatMessage, Conversation, User, VocabularyTerm
from app.routers import buddy


class BuddyPracticeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.engine = create_engine(
            f"sqlite:///{Path(self.tmp.name) / 'buddy.db'}",
            connect_args={"check_same_thread": False},
        )
        SQLModel.metadata.create_all(self.engine)
        with Session(self.engine) as session:
            user = User(email="buddy@example.test", name="Buddy Test")
            session.add(user)
            session.commit()
            session.refresh(user)
            conversation = Conversation(user_id=user.id, title="Technical practice")
            session.add(conversation)
            session.commit()
            session.refresh(conversation)
            self.user_id = user.id
            self.conversation_id = conversation.id

        def session_override():
            with Session(self.engine) as session:
                yield session

        app.dependency_overrides[get_session] = session_override
        app.dependency_overrides[get_current_user] = lambda: User(
            id=self.user_id,
            email="buddy@example.test",
            name="Buddy Test",
        )
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.engine.dispose()
        self.tmp.cleanup()

    def test_daily_session_progress_and_streak_are_persistent(self):
        started = self.client.post(
            "/api/buddy/sessions",
            json={
                "conversation_id": self.conversation_id,
                "topic": "Architecture trade-off",
                "goal": "State one clear recommendation",
                "target_minutes": 1,
            },
        )
        self.assertEqual(started.status_code, 200)
        session_id = started.json()["id"]

        updated = self.client.patch(
            f"/api/buddy/sessions/{session_id}",
            json={
                "spoken_seconds_delta": 61,
                "words_spoken_delta": 120,
                "turn_count_delta": 2,
            },
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["status"], "completed")

        dashboard = self.client.get("/api/buddy/dashboard")
        self.assertEqual(dashboard.status_code, 200)
        self.assertGreaterEqual(dashboard.json()["stats"]["today_minutes"], 1)
        self.assertEqual(dashboard.json()["stats"]["current_streak"], 1)
        self.assertEqual(dashboard.json()["stats"]["sessions_completed"], 1)

    def test_vocabulary_is_deduplicated_and_practised(self):
        first = self.client.post(
            "/api/buddy/vocabulary",
            json={"term": "stale run", "meaning": "A run using outdated state"},
        )
        second = self.client.post(
            "/api/buddy/vocabulary",
            json={"term": "Stale Run", "example": "The stale run was quarantined."},
        )
        self.assertEqual(first.json()["id"], second.json()["id"])

        practised = self.client.patch(
            f"/api/buddy/vocabulary/{first.json()['id']}",
            json={"practise": True, "confidence": 3},
        )
        self.assertEqual(practised.status_code, 200)
        self.assertEqual(practised.json()["times_practised"], 1)
        self.assertEqual(practised.json()["confidence"], 3)
        with Session(self.engine) as session:
            self.assertEqual(len(session.exec(select(VocabularyTerm)).all()), 1)

    def test_live_turn_is_saved_to_the_existing_chat(self):
        response = self.client.post(
            "/api/buddy/turns",
            json={
                "conversation_id": self.conversation_id,
                "role": "user",
                "content": "I would isolate the failed stage first.",
                "duration_seconds": 4.5,
                "word_count": 8,
            },
        )
        self.assertEqual(response.status_code, 200)
        with Session(self.engine) as session:
            message = session.exec(select(ChatMessage)).one()
            self.assertEqual(message.conversation_id, self.conversation_id)
            self.assertIn("isolate", message.content)
            self.assertEqual(len(session.exec(select(BuddySession)).all()), 0)

    def test_realtime_offer_is_proxied_without_exposing_the_api_key(self):
        captured = {}

        class FakeResponse:
            status_code = 200
            content = b"v=0\r\nanswer"

        class FakeAsyncClient:
            def __init__(self, **kwargs):
                captured["client"] = kwargs

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                return None

            async def post(self, url, **kwargs):
                captured["url"] = url
                captured["request"] = kwargs
                return FakeResponse()

        old_key = buddy.settings.openai_api_key
        buddy.settings.openai_api_key = "test-server-key"
        try:
            with patch("app.routers.buddy.httpx.AsyncClient", FakeAsyncClient):
                response = self.client.post(
                    f"/api/buddy/realtime?conversation_id={self.conversation_id}",
                    content=b"v=0\r\noffer",
                    headers={"Content-Type": "application/sdp"},
                )
        finally:
            buddy.settings.openai_api_key = old_key

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "application/sdp")
        self.assertEqual(captured["url"], "https://api.openai.com/v1/realtime/calls")
        self.assertIn("session", captured["request"]["files"])
        self.assertEqual(
            captured["request"]["headers"]["Authorization"],
            "Bearer test-server-key",
        )
        config = json.loads(captured["request"]["files"]["session"][1])
        turn_detection = config["audio"]["input"]["turn_detection"]
        self.assertEqual(turn_detection["type"], "semantic_vad")
        self.assertEqual(turn_detection["eagerness"], "medium")
        self.assertFalse(turn_detection["interrupt_response"])
        self.assertEqual(
            config["audio"]["input"]["noise_reduction"]["type"], "far_field"
        )
        self.assertEqual(config["audio"]["output"]["speed"], 1.15)
        self.assertEqual(config["max_output_tokens"], 4096)
        self.assertIn("at least 80% of the speaking", config["instructions"])
        self.assertIn("roughly 60 to 180 words", config["instructions"])


if __name__ == "__main__":
    unittest.main()
