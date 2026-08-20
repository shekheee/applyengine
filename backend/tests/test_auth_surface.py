import unittest

from fastapi.testclient import TestClient

from app.main import app


class AuthSurfaceTests(unittest.TestCase):
    def test_public_registration_route_is_not_exposed(self):
        response = TestClient(app).post(
            "/api/auth/register",
            json={
                "email": "new-user@example.test",
                "password": "not-used",
                "name": "New User",
            },
        )

        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
