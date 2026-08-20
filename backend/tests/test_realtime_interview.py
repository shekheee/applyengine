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
from app.models import InterviewSession, InterviewTurn, User
from app.routers import interview


class RealtimeInterviewTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.engine = create_engine(
            f"sqlite:///{Path(self.tmp.name) / 'realtime-interview.db'}",
            connect_args={"check_same_thread": False},
        )
        SQLModel.metadata.create_all(self.engine)
        with Session(self.engine) as session:
            user = User(email="interview@example.test", name="Interview Test")
            session.add(user)
            session.commit()
            session.refresh(user)
            practice = InterviewSession(
                user_id=user.id,
                mode="live",
                focus="mixed",
                difficulty="senior",
                questions=[
                    {"text": "Tell me about your impact.", "category": "behavioral"},
                    {"text": "Explain a technical trade-off.", "category": "role_technical"},
                ],
                live_state={"behavior_mode": "simulation"},
            )
            session.add(practice)
            session.commit()
            session.refresh(practice)
            self.user_id = user.id
            self.session_id = practice.id

        def session_override():
            with Session(self.engine) as session:
                yield session

        app.dependency_overrides[get_session] = session_override
        app.dependency_overrides[get_current_user] = lambda: User(
            id=self.user_id,
            email="interview@example.test",
            name="Interview Test",
        )
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.engine.dispose()
        self.tmp.cleanup()

    def test_realtime_offer_uses_continuous_voice_configuration(self):
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

        old_key = interview.settings.openai_api_key
        interview.settings.openai_api_key = "test-server-key"
        try:
            with patch("app.routers.interview.httpx.AsyncClient", FakeAsyncClient):
                response = self.client.post(
                    f"/api/interview/sessions/{self.session_id}/realtime",
                    content=b"v=0\r\noffer",
                    headers={"Content-Type": "application/sdp"},
                )
        finally:
            interview.settings.openai_api_key = old_key

        self.assertEqual(response.status_code, 200)
        self.assertEqual(captured["url"], "https://api.openai.com/v1/realtime/calls")
        config = json.loads(captured["request"]["files"]["session"][1])
        self.assertEqual(config["model"], interview.settings.openai_realtime_model)
        self.assertEqual(
            config["audio"]["input"]["turn_detection"]["silence_duration_ms"],
            900,
        )
        self.assertEqual(config["audio"]["input"]["turn_detection"]["threshold"], 0.7)
        self.assertFalse(config["audio"]["input"]["turn_detection"]["interrupt_response"])
        self.assertEqual(config["audio"]["input"]["noise_reduction"]["type"], "far_field")
        self.assertEqual(config["audio"]["output"]["speed"], 1.15)
        self.assertEqual(config["max_output_tokens"], 140)
        self.assertEqual(config["tools"][0]["name"], "end_interview")

    def test_realtime_turns_are_saved_idempotently(self):
        candidate = {
            "role": "candidate",
            "content": "I reduced stale runs by adding state validation.",
            "request_id": "candidate-turn-1",
            "duration_seconds": 4.2,
        }
        first = self.client.post(
            f"/api/interview/sessions/{self.session_id}/realtime/turns",
            json=candidate,
        )
        replay = self.client.post(
            f"/api/interview/sessions/{self.session_id}/realtime/turns",
            json=candidate,
        )
        interviewer_turn = self.client.post(
            f"/api/interview/sessions/{self.session_id}/realtime/turns",
            json={
                "role": "interviewer",
                "content": "What was your individual contribution?",
                "request_id": "interviewer-turn-1",
                "latency_ms": 640,
            },
        )

        self.assertEqual(first.status_code, 200)
        self.assertEqual(replay.json()["id"], first.json()["id"])
        self.assertEqual(interviewer_turn.status_code, 200)
        with Session(self.engine) as session:
            turns = session.exec(select(InterviewTurn)).all()
            self.assertEqual(len(turns), 2)
            self.assertEqual(turns[0].scores["transport"], "webrtc")
            self.assertEqual(turns[1].scores["latency_ms"], 640)


if __name__ == "__main__":
    unittest.main()
