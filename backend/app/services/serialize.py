from __future__ import annotations

import re

from app.models import Job, Profile


def _content_tokens(value: object) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9]+", str(value or "").lower())
        if len(token) > 2
    }


def _same_achievement(left: object, right: object) -> bool:
    """Detect a parsed project summary derived from an experience highlight."""
    left_tokens = _content_tokens(left)
    right_tokens = _content_tokens(right)
    if not left_tokens or not right_tokens:
        return False
    common = left_tokens & right_tokens
    overlap = len(common) / min(len(left_tokens), len(right_tokens))
    jaccard = len(common) / len(left_tokens | right_tokens)
    return len(common) >= 6 and overlap >= 0.8 and jaccard >= 0.55


def profile_to_text(p: Profile) -> str:
    parts: list[str] = []
    name = getattr(p, "name", "") or ""
    if name:
        parts.append(name)
    contact = [
        str(value).strip()
        for value in (
            getattr(p, "email", ""),
            getattr(p, "phone", ""),
            getattr(p, "location", ""),
        )
        if str(value or "").strip()
    ]
    if contact:
        parts.append("Contact: " + " | ".join(contact))
    links = getattr(p, "links", None) or []
    if links:
        parts.append("Links: " + " | ".join(str(link) for link in links if link))
    summary = getattr(p, "summary", "") or ""
    if summary:
        parts.append(summary)
    skills = getattr(p, "skills", None) or []
    if skills:
        parts.append("Skills: " + ", ".join(str(s) for s in skills))
    experience = getattr(p, "experience", None) or []
    projects = getattr(p, "projects", None) or []

    # Parsers sometimes create a Projects item from an achievement already under
    # Experience. Attach its label to that one achievement instead of serializing
    # the same fact as a second standalone section.
    project_for_highlight: dict[tuple[int, int], list[str]] = {}
    matched_projects: set[int] = set()
    for project_index, project in enumerate(projects):
        description = project.get("description", "")
        best: tuple[int, int] | None = None
        best_common = 0
        for experience_index, exp in enumerate(experience):
            for highlight_index, highlight in enumerate(exp.get("highlights", []) or []):
                if not _same_achievement(description, highlight):
                    continue
                common = len(
                    _content_tokens(description) & _content_tokens(highlight)
                )
                if common > best_common:
                    best = (experience_index, highlight_index)
                    best_common = common
        if best is not None:
            name = str(project.get("name") or project.get("title") or "").strip()
            if name:
                project_for_highlight.setdefault(best, []).append(name)
            matched_projects.add(project_index)

    for experience_index, exp in enumerate(experience):
        head = " ".join(str(exp.get(k, "")) for k in ("title", "company", "dates"))
        parts.append(head.strip())
        for highlight_index, highlight in enumerate(exp.get("highlights", []) or []):
            labels = project_for_highlight.get((experience_index, highlight_index), [])
            prefix = f"{' / '.join(labels)} — " if labels else ""
            parts.append(f"- {prefix}{highlight}")
    for project_index, proj in enumerate(projects):
        if project_index in matched_projects:
            continue
        parts.append(f"{proj.get('name', '')}: {proj.get('description', '')}")
    education = getattr(p, "education", None) or []
    if education:
        parts.append("Education:")
        for item in education:
            if not isinstance(item, dict):
                continue
            line = " | ".join(
                str(item.get(key, "")).strip()
                for key in ("degree", "school", "dates")
                if str(item.get(key, "")).strip()
            )
            if line:
                parts.append(f"- {line}")
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
