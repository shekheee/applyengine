from __future__ import annotations

from app.models import Profile
from app.services.coach import build_coach_messages
from app.services.parsing import parse_resume
from app.services.privacy import IdentifierPrivacy


def _profile() -> Profile:
    return Profile(
        user_id=1,
        name="Ajay Shekhawat",
        summary="Data scientist focused on reliable decision systems.",
        skills=["Python", "Machine learning"],
        experience=[
            {
                "title": "Senior Data Scientist",
                "company": "Compare the Market",
                "dates": "2022-present",
                "highlights": ["Reduced stale scoring runs by 35 percent."],
            },
            {
                "title": "Data Scientist",
                "company": "Example Analytics Ltd",
                "dates": "2019-2022",
                "highlights": ["Built a demand forecasting service."],
            },
        ],
    )


def test_profile_privacy_masks_only_identity_and_former_employers():
    privacy = IdentifierPrivacy.from_profile(_profile())
    source = (
        "Ajay Shekhawat worked at Compare the Market and Example Analytics Ltd. "
        "He is applying to Future Systems with Python experience."
    )

    protected = privacy.mask_text(source)

    assert "Ajay Shekhawat" not in protected
    assert "Compare the Market" not in protected
    assert "Example Analytics Ltd" not in protected
    assert "Future Systems" in protected
    assert "Python" in protected
    assert privacy.restore_text(protected) == source


def test_coach_masks_profile_history_and_user_message():
    profile = _profile()
    messages = build_coach_messages(
        "Help me explain my work at Compare the Market.",
        profile,
        [],
        [],
    )
    payload = repr(messages)

    assert "Ajay Shekhawat" not in payload
    assert "Compare the Market" not in payload
    assert "[CANDIDATE_NAME]" in payload
    assert "[FORMER_EMPLOYER_1]" in payload
    assert "Never infer" in payload


def test_resume_upload_is_masked_before_model_parsing(monkeypatch):
    captured: dict[str, str] = {}

    class CapturingChain:
        def reset(self):
            return None

        def chat_json(self, system: str, user: str):
            captured["system"] = system
            captured["user"] = user
            return {
                "name": "[CANDIDATE_NAME]",
                "email": "ajay@example.com",
                "skills": ["Python"],
                "experience": [
                    {
                        "title": "Senior Data Scientist",
                        "company": "[FORMER_EMPLOYER_1]",
                        "dates": "2022-present",
                        "highlights": ["Improved model reliability."],
                    }
                ],
                "projects": [],
                "education": [],
            }

    monkeypatch.setattr(
        "app.services.parsing.build_coach_provider", lambda: CapturingChain()
    )
    resume = """Ajay Shekhawat
ajay@example.com

EXPERIENCE
Senior Data Scientist, Compare the Market, 2022-present
- Improved model reliability.

SKILLS
Python
"""

    parsed = parse_resume(resume)

    assert "Ajay Shekhawat" not in captured["user"]
    assert "Compare the Market" not in captured["user"]
    assert "[CANDIDATE_NAME]" in captured["user"]
    assert "[FORMER_EMPLOYER_1]" in captured["user"]
    assert parsed["name"] == "Ajay Shekhawat"
    assert parsed["experience"][0]["company"] == "Compare the Market"
