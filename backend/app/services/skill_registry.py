from __future__ import annotations

SKILLS = (
    {
        "id": "resume-builder",
        "name": "Resume Builder",
        "description": "Tailor your verified base resume, inspect a full A4 preview, and export PDF or Word.",
        "category": "Career documents",
        "href": "/resume",
        "output_formats": ["pdf", "docx"],
    },
    {
        "id": "document-writer",
        "name": "Document Writer",
        "description": "Create grounded cover letters, executive briefs, proposals, and interview notes.",
        "category": "Professional writing",
        "href": "/skills/documents",
        "output_formats": ["docx", "pdf"],
    },
    {
        "id": "presentation-builder",
        "name": "Presentation Builder",
        "description": "Build interview decks, case studies, personal pitches, and 30/60/90-day plans.",
        "category": "Presentations",
        "href": "/skills/presentations",
        "output_formats": ["pptx"],
    },
)

GENERATIVE_SKILL_IDS = {"document-writer", "presentation-builder"}


def list_skills() -> list[dict]:
    return [dict(skill) for skill in SKILLS]
