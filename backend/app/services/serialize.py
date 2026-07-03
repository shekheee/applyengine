from __future__ import annotations

from app.models import Job, Profile


def profile_to_text(p: Profile) -> str:
    parts: list[str] = []
    if p.name:
        parts.append(p.name)
    if p.summary:
        parts.append(p.summary)
    if p.skills:
        parts.append("Skills: " + ", ".join(p.skills))
    for exp in p.experience:
        head = " ".join(str(exp.get(k, "")) for k in ("title", "company", "dates"))
        parts.append(head.strip())
        for h in exp.get("highlights", []) or []:
            parts.append(f"- {h}")
    for proj in p.projects:
        parts.append(f"{proj.get('name', '')}: {proj.get('description', '')}")
    # If parsing was thin, fall back to the raw resume text.
    text = "\n".join(x for x in parts if x).strip()
    return text or p.raw_text


def job_to_text(j: Job) -> str:
    parts: list[str] = [f"{j.title} at {j.company}".strip(" at")]
    if j.summary:
        parts.append(j.summary)
    if j.requirements:
        parts.append("Requirements:\n" + "\n".join(f"- {r}" for r in j.requirements))
    if j.keywords:
        parts.append("Keywords: " + ", ".join(j.keywords))
    text = "\n".join(x for x in parts if x).strip()
    return text or j.raw_text
