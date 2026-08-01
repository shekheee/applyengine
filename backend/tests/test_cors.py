import inspect
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine

from app.auth import get_current_user
from app.db import get_session
from app.main import app
from app.models import User
from app.routers.profiles import upload_base_resume


ORIGIN = "https://applyengine.ajayshekhawat.uk"
PREFLIGHT_HEADERS = {
    "Origin": ORIGIN,
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "authorization,content-type",
}


class CorsRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def assert_valid_post_preflight(self, path: str):
        response = self.client.options(path, headers=PREFLIGHT_HEADERS)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["access-control-allow-origin"], ORIGIN)
        self.assertEqual(response.headers["access-control-allow-credentials"], "true")
        methods = response.headers["access-control-allow-methods"]
        self.assertIn("POST", methods)
        self.assertIn("OPTIONS", methods)
        allowed_headers = response.headers["access-control-allow-headers"].lower()
        self.assertIn("authorization", allowed_headers)
        self.assertIn("content-type", allowed_headers)

    def test_analyze_fit_preflight(self):
        self.assert_valid_post_preflight("/api/applications/6/analyze-fit")

    def test_profile_upload_preflight(self):
        self.assert_valid_post_preflight("/api/profiles/upload")

    def test_handled_auth_error_keeps_cors_header(self):
        response = self.client.get(
            "/api/profiles/base",
            headers={"Origin": ORIGIN},
        )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.headers["access-control-allow-origin"], ORIGIN)

    def test_upload_handler_runs_in_threadpool(self):
        self.assertFalse(inspect.iscoroutinefunction(upload_base_resume))

    def test_health_is_side_effect_free(self):
        response = self.client.get("/api/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    def test_upload_response_contains_refreshed_profile(self):
        with tempfile.TemporaryDirectory() as tmp:
            engine = create_engine(
                f"sqlite:///{Path(tmp) / 'cors.db'}",
                connect_args={"check_same_thread": False},
            )
            SQLModel.metadata.create_all(engine)
            with Session(engine) as session:
                user = User(email="cors@example.test", name="CORS Test")
                session.add(user)
                session.commit()
                session.refresh(user)
                user_id = user.id

            def session_override():
                with Session(engine) as session:
                    yield session

            app.dependency_overrides[get_session] = session_override
            app.dependency_overrides[get_current_user] = lambda: User(
                id=user_id,
                email="cors@example.test",
                name="CORS Test",
            )
            parsed = {
                "name": "Integration Candidate",
                "summary": "Backend engineer.",
                "skills": ["Python"],
                "experience": [],
                "projects": [],
                "education": [],
                "links": [],
                "raw_text": "Integration Candidate backend engineer " * 4,
            }
            try:
                with patch(
                    "app.routers.profiles._parse_resume_or_raise",
                    return_value=parsed,
                ):
                    response = self.client.post(
                        "/api/profiles/upload",
                        headers={"Authorization": "Bearer test", "Origin": ORIGIN},
                        files={
                            "file": (
                                "resume.txt",
                                parsed["raw_text"].encode(),
                                "text/plain",
                            )
                        },
                    )
            finally:
                app.dependency_overrides.clear()
                engine.dispose()

        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.json().get("id"), int)
        self.assertEqual(response.json()["name"], "Integration Candidate")


if __name__ == "__main__":
    unittest.main()
