from __future__ import annotations

import json
from typing import Any

from app.llm.factory import build_coach_provider
from app.models import Job, Profile
from app.services.serialize import job_to_text, profile_to_text
from app.services.skill_registry import GENERATIVE_SKILL_IDS

DOCUMENT_TEMPLATES = {
    "cover-letter": "a persuasive, specific cover letter",
    "executive-brief": "a concise executive brief for senior stakeholders",
    "interview-notes": "an interview preparation and evidence document",
    "proposal": "a professional proposal with outcomes, approach, and next steps",
}

PRESENTATION_TEMPLATES = {
    "interview-deck": "an interview presentation showing fit, evidence, and a practical point of view",
    "case-study": "a case-study presentation with problem, approach, decisions, results, and lessons",
    "30-60-90": "a credible 30/60/90-day plan grounded in the target role",
    "personal-pitch": "a concise professional pitch deck grounded in the candidate's experience",
}


def _clean_text(value: object, limit: int = 10_000) -> str:
    return str(value or "").strip()[:limit]


def _string_list(value: object, limit: int = 12) -> list[str]:
    if not isinstance(value, list):
        return []
    return [_clean_text(item, 500) for item in value if _clean_text(item, 500)][:limit]


def _normalize_document(data: dict[str, Any], title: str, template: str) -> dict[str, Any]:
    sections: list[dict[str, Any]] = []
    raw_sections = data.get("sections", [])
    if isinstance(raw_sections, list):
        for raw in raw_sections[:10]:
            if not isinstance(raw, dict):
                continue
            heading = _clean_text(raw.get("heading"), 160)
            paragraphs = _string_list(raw.get("paragraphs"), 8)
            bullets = _string_list(raw.get("bullets"), 12)
            if heading or paragraphs or bullets:
                sections.append({"heading": heading, "paragraphs": paragraphs, "bullets": bullets})
    if not sections:
        body = _clean_text(data.get("body") or data.get("content"), 12_000)
        sections = [{"heading": "", "paragraphs": [body] if body else [], "bullets": []}]
    return {
        "kind": "document",
        "template": template,
        "title": _clean_text(data.get("title") or title or "Professional document", 180),
        "subtitle": _clean_text(data.get("subtitle"), 240),
        "sections": sections,
        "closing": _clean_text(data.get("closing"), 1_500),
    }


def _normalize_presentation(data: dict[str, Any], title: str, template: str) -> dict[str, Any]:
    slides: list[dict[str, Any]] = []
    raw_slides = data.get("slides", [])
    if isinstance(raw_slides, list):
        for raw in raw_slides[:12]:
            if not isinstance(raw, dict):
                continue
            slide_title = _clean_text(raw.get("title"), 140)
            body = _clean_text(raw.get("body"), 1_500)
            bullets = _string_list(raw.get("bullets"), 7)
            if slide_title or body or bullets:
                slides.append({
                    "title": slide_title or "Key point",
                    "kicker": _clean_text(raw.get("kicker"), 80),
                    "body": body,
                    "bullets": bullets,
                    "speaker_notes": _clean_text(raw.get("speaker_notes"), 2_000),
                })
    if not slides:
        slides = [{"title": "Purpose", "kicker": "Overview", "body": _clean_text(data.get("body"), 1_500), "bullets": [], "speaker_notes": ""}]
    return {
        "kind": "presentation",
        "template": template,
        "title": _clean_text(data.get("title") or title or "Professional presentation", 180),
        "subtitle": _clean_text(data.get("subtitle"), 240),
        "slides": slides,
    }


def _fallback_content(skill_id: str, template: str, title: str, brief: str) -> dict[str, Any]:
    if skill_id == "document-writer":
        return _normalize_document({"title": title, "sections": [{"heading": "Draft", "paragraphs": [brief], "bullets": []}]}, title, template)
    return _normalize_presentation({
        "title": title,
        "slides": [
            {"title": "Context", "body": brief},
            {"title": "Evidence", "bullets": ["Add your strongest relevant example"]},
            {"title": "Next steps", "bullets": ["Confirm priorities and success measures"]},
        ],
    }, title, template)


def generate_skill_content(
    *,
    skill_id: str,
    template: str,
    title: str,
    brief: str,
    profile: Profile | None,
    job: Job | None,
    model_id: str | None,
    reasoning_effort: str,
    existing: dict[str, Any] | None = None,
    revision_instruction: str = "",
) -> tuple[dict[str, Any], str | None, str | None, str]:
    if skill_id not in GENERATIVE_SKILL_IDS:
        raise ValueError("This skill does not generate artifacts through this endpoint")
    template_map = DOCUMENT_TEMPLATES if skill_id == "document-writer" else PRESENTATION_TEMPLATES
    if template not in template_map:
        raise ValueError("Unknown skill template")

    profile_context = profile_to_text(profile) if profile else "No base resume is available."
    job_context = job_to_text(job) if job else "No target job was selected."
    if skill_id == "document-writer":
        schema = "Return JSON with title, subtitle, sections (objects with heading, paragraphs array, bullets array), and closing. Do not use markdown inside values."
    else:
        schema = "Return JSON with title, subtitle, and 6-10 slides. Each slide has title, kicker, body, bullets (maximum 7), and speaker_notes. Do not create a title slide. Keep slide copy concise and put detail in notes."

    system = f"""You are an expert career artifact designer. Create {template_map[template]}.
Ground every claim in the supplied resume, job description, or user brief. Never invent employers, metrics, qualifications, or outcomes. Use contemporary UK professional language and an executive-quality information hierarchy.
{schema}"""
    user_parts = [
        f"TITLE REQUEST: {title or 'Choose a specific professional title'}",
        f"USER BRIEF:\n{brief}",
        f"VERIFIED RESUME CONTEXT:\n{profile_context}",
        f"TARGET JOB CONTEXT:\n{job_context}",
    ]
    if existing:
        user_parts.append("CURRENT ARTIFACT:\n" + json.dumps(existing, ensure_ascii=False))
        user_parts.append(f"REVISION REQUEST:\n{revision_instruction}")

    chain = None
    try:
        chain = build_coach_provider(model_id, reasoning_effort)
        chain.reset()
        raw = chain.chat_json(system, "\n\n".join(user_parts))
        if not isinstance(raw, dict):
            raise ValueError("Model returned an invalid artifact")
        content = _normalize_document(raw, title, template) if skill_id == "document-writer" else _normalize_presentation(raw, title, template)
    except Exception:
        if existing:
            raise
        content = _fallback_content(skill_id, template, title or "New artifact", brief)

    return (
        content,
        chain.last_served if chain else None,
        chain.last_model if chain else None,
        chain.requested_model if chain else (model_id or ""),
    )
