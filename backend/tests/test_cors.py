import inspect
import unittest

from fastapi.testclient import TestClient

from app.main import app
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


if __name__ == "__main__":
    unittest.main()
