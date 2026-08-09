from app.services import parsing


RESUME_TEXT = """Test Candidate
test@example.com
London, UK

SUMMARY
Data scientist with eight years of experience.

EXPERIENCE
Senior Data Scientist, Example Ltd, 2022-present
- Built a forecasting model that improved accuracy by 20 percent.

SKILLS
Python, SQL, machine learning
"""


class BrokenChain:
    def reset(self):
        pass

    def chat_json(self, system: str, user: str):
        raise RuntimeError("provider unavailable")


class WorkingChain:
    def reset(self):
        pass

    def chat_json(self, system: str, user: str):
        return {
            "name": "Parsed Candidate",
            "email": "parsed@example.com",
            "skills": ["Python"],
            "experience": [],
            "projects": [],
            "education": [],
        }


def test_resume_parser_uses_local_fallback_when_all_providers_fail(monkeypatch):
    monkeypatch.setattr(parsing, "build_coach_provider", lambda: BrokenChain())

    parsed = parsing.parse_resume(RESUME_TEXT)

    assert parsed["name"] == "Test Candidate"
    assert parsed["email"] == "test@example.com"
    assert "python" in parsed["skills"]
    assert parsed["raw_text"] == RESUME_TEXT


def test_resume_parser_keeps_structured_provider_result(monkeypatch):
    monkeypatch.setattr(parsing, "build_coach_provider", lambda: WorkingChain())

    parsed = parsing.parse_resume(RESUME_TEXT)

    assert parsed["name"] == "Parsed Candidate"
    assert parsed["email"] == "parsed@example.com"
    assert parsed["skills"] == ["Python"]


def test_job_parser_uses_local_fallback_when_all_providers_fail(monkeypatch):
    monkeypatch.setattr(parsing, "build_coach_provider", lambda: BrokenChain())
    job_text = """Senior Data Scientist
Example Ltd
- Five years of Python experience
- Strong machine learning knowledge
"""

    parsed = parsing.parse_job(job_text)

    assert parsed["title"] == "Senior Data Scientist"
    assert "python" in parsed["keywords"]
    assert len(parsed["requirements"]) == 2
