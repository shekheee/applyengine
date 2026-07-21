from __future__ import annotations

from app.models import Job, Profile


def profile_to_text(p: Profile) -> str:
    parts: list[str] = []
    name = getattr(p, "name", "") or ""
    if name:
        parts.append(name)
    summary = getattr(p, "summary", "") or ""
    if summary:
        parts.append(summary)
    skills = getattr(p, "skills", None) or []
    if skills:
        parts.append("Skills: " + ", ".join(str(s) for s in skills))
    for exp in getattr(p, "experience", None) or []:
        head = " ".join(str(exp.get(k, "")) for k in ("title", "company", "dates"))
        parts.append(head.strip())
        for h in exp.get("highlights", []) or []:
            parts.append(f"- {h}")
    for proj in getattr(p, "projects", None) or []:
        parts.append(f"{proj.get('name', '')}: {proj.get('description', '')}")
    # If parsing was thin, fall back to the raw resume text.
    text = "\n".join(x for x in parts if x).strip()
    raw_text = getattr(p, "raw_text", "") or ""
    return text or raw_text


def job_to_text(j: Job) -> str:
    title = getattr(j, "title", "") or ""
    company = getattr(j, "company", "") or ""
    parts: list[str] = [f"{title} at {company}".strip(" at")]
    summary = getattr(j, "summary", "") or ""
    if summary:
        parts.append(summary)
    requirements = getattr(j, "requirements", None) or []
    if requirements:
        parts.append("Requirements:\n" + "\n".join(f"- {r}" for r in requirements))
    keywords = getattr(j, "keywords", None) or []
    if keywords:
        parts.append("Keywords: " + ", ".join(str(k) for k in keywords))
    text = "\n".join(x for x in parts if x).strip()
    raw_text = getattr(j, "raw_text", "") or ""
    return text or raw_text
