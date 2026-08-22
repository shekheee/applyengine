import unittest
from unittest.mock import patch

from app.models import Profile
from app.services.coach import build_coach_messages
from app.services.resume_designed import design_resume_with_ai
from app.services.resume_normalize import normalize_resume_data
from app.services.resume_templates import (
    _auto_skill_groups,
    enrich_designed_doc,
    prepare_one_page_resume_doc,
    render_resume_template,
)
from app.services.serialize import profile_to_text


class ResumeContextTests(unittest.TestCase):
    @patch("app.services.resume_designed.build_coach_provider")
    def test_resume_design_uses_configured_primary_chain(self, build_provider):
        captured = {}

        class FakeChain:
            last_model = "gpt-primary"
            last_served = "openai"

            def reset(self):
                return None

            def chat_json(self, _system, _user):
                captured["user"] = _user
                return {
                    "name": "[CANDIDATE_NAME]",
                    "summary": "Data scientist.",
                    "skills": ["Python"],
                    "experience": [],
                    "projects": [],
                    "education": [],
                }

        build_provider.return_value = FakeChain()
        doc, provider, model = design_resume_with_ai(
            Profile(user_id=1, name="Example Candidate"), []
        )

        build_provider.assert_called_once_with(None)
        self.assertEqual(doc["name"], "Example Candidate")
        self.assertNotIn("Example Candidate", captured["user"])
        self.assertIn("[CANDIDATE_NAME]", captured["user"])
        self.assertEqual(provider, "openai")
        self.assertEqual(model, "gpt-primary")

    @patch("app.services.resume_designed.build_coach_provider")
    def test_resume_design_honours_selected_model(self, build_provider):
        class FakeChain:
            last_model = "selected-model"
            last_served = "openai"

            def reset(self):
                return None

            def chat_json(self, _system, _user):
                return {"name": "[CANDIDATE_NAME]", "experience": []}

        build_provider.return_value = FakeChain()

        design_resume_with_ai(
            Profile(user_id=1, name="Example Candidate"), [], model_id="selected-model"
        )

        build_provider.assert_called_once_with("selected-model")

    def test_canonical_profile_overrides_model_sidebar_fabrications(self):
        profile = Profile(
            user_id=1,
            name="Verified Candidate",
            email="verified@example.com",
            phone="+44 1234 567890",
            location="Belfast, UK",
            links=["linkedin.com/in/verified"],
            skills=[f"Skill {index}" for index in range(24)],
            education=[{"degree": "MSc AI", "school": "Verified University"}],
        )
        model_doc = {
            "name": "Invented Name",
            "email": "fake@example.com",
            "phone": "+44 7000 000000",
            "location": "London",
            "links": ["github.com/fake"],
            "skills": ["Invented Framework", "Skill 3", "Skill 1"],
            "skill_groups": [{"name": "Everything", "items": ["Invented Framework"]}],
            "education": [{"degree": "PhD", "school": "University Name"}],
            "certifications": ["Invented Certification"],
        }

        enriched = enrich_designed_doc(model_doc, profile)

        self.assertEqual(enriched["name"], profile.name)
        self.assertEqual(enriched["email"], profile.email)
        self.assertEqual(enriched["phone"], profile.phone)
        self.assertEqual(enriched["education"], profile.education)
        self.assertNotIn("Invented Framework", enriched["skills"])
        self.assertNotIn("skill_groups", enriched)
        self.assertEqual(len(enriched["skills"]), 24)
        self.assertEqual(enriched["certifications"], [])

    def test_one_page_budget_limits_density_before_preview(self):
        doc = {
            "name": "Example Candidate",
            "summary": " ".join(["word"] * 80),
            "skills": [f"Skill {index}" for index in range(30)],
            "experience": [
                {
                    "title": f"Role {role}",
                    "company": f"Company {role}",
                    "highlights": [f"Impact {index}" for index in range(6)],
                }
                for role in range(6)
            ],
        }

        fitted = prepare_one_page_resume_doc(doc)
        rendered = render_resume_template(fitted, style="signature", compact=False)

        self.assertLessEqual(len(fitted["summary"].split()), 52)
        self.assertEqual(len(fitted["skills"]), 30)
        self.assertEqual(len(fitted["experience"]), 4)
        self.assertEqual(
            [len(item["highlights"]) for item in fitted["experience"]],
            [5, 3, 3, 2],
        )
        self.assertIn("margin: 0", rendered)
        self.assertIn("height: 297mm", rendered)
        self.assertIn('font-family: Calibri, "Segoe UI", Arial, sans-serif', rendered)
        self.assertIn("width: 28%", rendered)
        self.assertIn("justify-content: space-between", rendered)
        self.assertNotIn("min-height: 100%", rendered)
        self.assertEqual(rendered.count("Impact 5"), 0)

    def test_profile_serialization_includes_contact_links_and_education(self):
        profile = Profile(
            user_id=1,
            name="Example Candidate",
            email="candidate@example.com",
            phone="+44 1234 567890",
            location="Belfast, UK",
            links=["linkedin.com/in/example"],
            education=[{"degree": "MSc AI", "school": "Example University", "dates": "2020"}],
        )

        text = profile_to_text(profile)

        self.assertIn("candidate@example.com", text)
        self.assertIn("Belfast, UK", text)
        self.assertIn("linkedin.com/in/example", text)
        self.assertIn("MSc AI | Example University | 2020", text)

    def test_skill_groups_keep_rag_out_of_single_letter_r_language(self):
        groups = _auto_skill_groups(
            ["R", "Python", "SQL", "SQL Server", "RAG & reranking", "Prompt engineering", "GCP"]
        )
        by_name = {group["name"]: group["items"] for group in groups}

        self.assertIn("R", by_name["Data Science & ML"])
        self.assertIn("SQL", by_name["Data Science & ML"])
        self.assertNotIn("SQL Server", by_name["Data Science & ML"])
        self.assertIn("SQL Server", by_name["Data Platforms & Deployment"])
        self.assertNotIn("RAG & reranking", by_name["Data Science & ML"])
        self.assertIn("RAG & reranking", by_name["AI / GenAI"])

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
