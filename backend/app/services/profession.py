from __future__ import annotations

from app.models import Job, Profile

# Legacy interview focus IDs → current profession-agnostic IDs
LEGACY_FOCUS_MAP = {
    "technical_ml": "role_technical",
    "system_design": "case_study",
    "resume_deep": "resume_deep_dive",
}

FOCUS_LABELS: dict[str, str] = {
    "behavioral": "Behavioral (STAR)",
    "role_technical": "Role-specific depth",
    "case_study": "Case / scenario",
    "leadership_stakeholder": "Leadership & stakeholders",
    "resume_deep_dive": "Resume deep-dive",
    "mixed": "Mixed (balanced practice)",
}

FOCUS_GUIDE: dict[str, str] = {
    "behavioral": (
        "STAR-style behavioral questions about leadership, collaboration, conflict, "
        "influence, and measurable outcomes."
    ),
    "role_technical": (
        "Role-specific technical or methodological depth adapted to the candidate's ACTUAL "
        "field (e.g. ML evaluation for a data scientist, ADKAR/Prosci for change management, "
        "audit standards for finance — never assume tech unless the resume is technical)."
    ),
    "case_study": (
        "Scenario/case questions requiring structured problem-solving in their domain."
    ),
    "leadership_stakeholder": (
        "Stakeholder alignment, executive influence, sponsorship, resistance, and "
        "cross-functional leadership."
    ),
    "resume_deep_dive": (
        "Deep questions on specific projects, roles, and achievements from their resume."
    ),
    "mixed": (
        "Balanced mix of behavioral, role-specific, scenario, leadership, and resume-deep "
        "questions — all calibrated to THEIR profession and target role, not generic tech."
    ),
}


def normalize_focus(focus: str) -> str:
    return LEGACY_FOCUS_MAP.get(focus, focus)


def focus_label(focus: str) -> str:
    return FOCUS_LABELS.get(normalize_focus(focus), focus.replace("_", " ").title())


def focus_guide(focus: str) -> str:
    return FOCUS_GUIDE.get(normalize_focus(focus), FOCUS_GUIDE["mixed"])


def profession_context(profile: Profile | None, job: Job | None = None) -> str:
    """Resume/job signals for the LLM to infer field — no hardcoded profession."""
    parts: list[str] = []
    if profile:
        summary = getattr(profile, "summary", "") or ""
        if summary:
            parts.append(f"Professional summary: {summary[:500]}")
        skills = getattr(profile, "skills", None) or []
        if skills:
            parts.append(f"Key skills: {', '.join(str(s) for s in skills[:24])}")
        for exp in (getattr(profile, "experience", None) or [])[:2]:
            if isinstance(exp, dict):
                title = exp.get("title") or ""
                company = exp.get("company") or ""
                if title or company:
                    parts.append(f"Experience: {title} at {company}".strip())
    if job:
        title = getattr(job, "title", "") or "Role"
        company = getattr(job, "company", "") or "Company"
        parts.append(f"Target role: {title} at {company}")
        job_summary = getattr(job, "summary", "") or ""
        if job_summary:
            parts.append(f"Job summary: {job_summary[:400]}")
        reqs = getattr(job, "requirements", None) or []
        if reqs:
            parts.append(f"Key requirements: {'; '.join(str(r) for r in reqs[:6])}")
    if not parts:
        return (
            "No detailed profile yet. Infer the candidate's profession only from whatever "
            "resume and job context is provided in this request."
        )
    return (
        "Use these signals to infer the candidate's profession, seniority, and the language "
        "norms of their field:\n" + "\n".join(f"- {p}" for p in parts)
    )
