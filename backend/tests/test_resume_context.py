import unittest

from app.models import Profile
from app.services.coach import build_coach_messages
from app.services.resume_normalize import normalize_resume_data
from app.services.serialize import profile_to_text


class ResumeContextTests(unittest.TestCase):
    def test_coach_context_serializes_overlapping_projects_once(self):
        first = (
            "Built a demand forecasting model for packaging assets, improving "
            "forecast accuracy by 12 percent and reducing logistics losses."
        )
        second = (
            "Developed a customer segmentation model that improved campaign "
            "targeting and measured a seven percent uplift."
        )
        profile = Profile(
            user_id=1,
            name="Example Candidate",
            summary="Commercial data scientist focused on measurable outcomes.",
            skills=["Python", "Forecasting"],
            experience=[
                {
                    "company": "Example Co",
                    "title": "Data Scientist",
                    "dates": "2022–2024",
                    "highlights": [first, second],
                }
            ],
            projects=[
                {"name": "Demand Forecasting", "description": first},
                {"name": "Customer Segmentation", "description": second},
            ],
        )

        messages = build_coach_messages("Review my resume.", profile, [], [])
        system = messages[0]["content"]

        self.assertEqual(system.count("Demand Forecasting"), 1)
        self.assertEqual(system.count("Customer Segmentation"), 1)
        self.assertEqual(system.count(first), 1)
        self.assertEqual(system.count(second), 1)
        self.assertEqual(system.count(profile.summary), 1)

    def test_deduplication_preserves_distinct_projects_with_same_name(self):
        duplicate = {
            "name": "Migration",
            "description": "Migrated finance reporting to a cloud warehouse.",
            "tech": ["SQL"],
        }
        distinct = {
            "name": "Migration",
            "description": "Migrated a mobile application to a new design system.",
            "tech": ["React"],
        }
        normalized = normalize_resume_data(
            {"experience": [], "projects": [duplicate, dict(duplicate), distinct]}
        )

        self.assertEqual(len(normalized["projects"]), 2)
        self.assertEqual(normalized["projects"][0]["tech"], ["SQL"])
        self.assertEqual(normalized["projects"][1]["tech"], ["React"])

    def test_identity_duplicate_keeps_richer_experience(self):
        normalized = normalize_resume_data(
            {
                "projects": [],
                "experience": [
                    {
                        "title": "Analyst",
                        "company": "Example Co",
                        "dates": "2020-2022",
                        "highlights": ["Built a reporting pipeline."],
                    },
                    {
                        "title": " analyst ",
                        "company": "EXAMPLE CO",
                        "dates": "2020 / 2022",
                        "highlights": [
                            "Built a reporting pipeline.",
                            "Reduced reporting time by 30 percent.",
                        ],
                    },
                ],
            }
        )

        self.assertEqual(len(normalized["experience"]), 1)
        self.assertEqual(len(normalized["experience"][0]["highlights"]), 2)

    def test_unrelated_project_remains_standalone(self):
        profile = Profile(
            user_id=1,
            experience=[
                {
                    "title": "Engineer",
                    "company": "Example Co",
                    "highlights": ["Improved API latency by 40 percent."],
                }
            ],
            projects=[
                {
                    "name": "Community Garden",
                    "description": "Organized volunteers and planted native species.",
                }
            ],
        )

        text = profile_to_text(profile)
        self.assertIn("Community Garden", text)
        self.assertIn("Improved API latency", text)


if __name__ == "__main__":
    unittest.main()
