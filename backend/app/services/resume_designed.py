from __future__ import annotations

import logging
from typing import Any

from app import prompts
from app.llm.factory import build_coach_provider
from app.models import Job, Memory, Profile
from app.services.resume_pdf import _merge_memories, _profile_has_content, _profile_to_doc, prepare_resume_document
from app.services.serialize import job_to_text, profile_to_text

logger = logging.getLogger(__name__)

DESIGN_MODEL_ID = "claude-opus-4-8"


def _memory_text(memories: list[Memory]) -> str:
    return "\n".join(f"- ({m.kind}) {m.content}" for m in memories)


def design_resume_with_claude(
    profile: Profile | None,
    memories: list[Memory],
    job: Job | None = None,
) -> tuple[dict[str, Any], str | None, str | None]:
    """Use Claude Opus 4.8 (with fallback chain) to produce structured resume JSON."""
    profile_text = profile_to_text(profile) if profile else ""
    memory_text = _memory_text(memories)
    job_text = job_to_text(job) if job else ""

    chain = build_coach_provider(DESIGN_MODEL_ID)
    chain.reset()
    data = chain.chat_json(
        prompts.RESUME_DESIGNED_SYSTEM,
        prompts.resume_designed_user(profile_text, memory_text, job_text),
    )
    model = chain.last_model
    provider = chain.last_served
    if chain.last_served:
        logger.info(
            "Designed resume served by %s/%s (job=%s)",
            provider,
            model,
            job.id if job else None,
        )
    if not isinstance(data, dict) or not data.get("name"):
        raise ValueError("Claude returned unusable resume structure")
    return data, provider, model


def prepare_designed_resume_document(
    profile: Profile | None,
    memories: list[Memory],
    job: Job | None = None,
) -> dict[str, Any]:
    """Canonical profile + memories → Claude-designed structured resume (with fallback)."""
    if not _profile_has_content(profile) and not memories:
        raise ValueError(
            "No resume data yet — upload a resume or chat with the coach first."
        )

    try:
        doc, _, _ = design_resume_with_claude(profile, memories, job)
        return doc
    except Exception as exc:
        logger.warning("Claude resume design failed, falling back to profile doc: %s", exc)
        if profile and _profile_has_content(profile):
            doc = _profile_to_doc(profile)
            return _merge_memories(doc, memories)
        return prepare_resume_document(profile, memories)


def design_resume_preview(
    profile: Profile | None,
    memories: list[Memory],
    job: Job | None = None,
) -> dict[str, Any]:
    """Return metadata after Claude design for UI confirmation."""
    doc, provider, model = design_resume_with_claude(profile, memories, job)
    return {
        "name": doc.get("name", ""),
        "summary_preview": (doc.get("summary") or "")[:240],
        "skills_count": len(doc.get("skills") or []),
        "experience_count": len(doc.get("experience") or []),
        "projects_count": len(doc.get("projects") or []),
        "education_count": len(doc.get("education") or []),
        "model_served": model,
        "provider_served": provider,
        "tailored_to_job": bool(job),
        "job_title": job.title if job else "",
        "job_company": job.company if job else "",
    }
