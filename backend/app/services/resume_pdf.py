from __future__ import annotations

import copy
import io
import logging
import re
from typing import Any

from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate

from app import prompts
from app.llm.factory import build_memory_provider
from app.models import Memory, Profile
from app.services.serialize import profile_to_text

logger = logging.getLogger(__name__)

_SECTION_HEAD = "#1a1a2e"
_ACCENT = "#4338ca"
_MUTED = "#4b5563"

# Progressive condensation levels for the one-page fit loop.
_CONDENSE_LEVELS: list[dict[str, int]] = [
    {"roles": 5, "bullets": 4, "summary_words": 50, "skills": 24, "projects": 3, "bullet_chars": 160},
    {"roles": 4, "bullets": 3, "summary_words": 40, "skills": 20, "projects": 2, "bullet_chars": 140},
    {"roles": 3, "bullets": 3, "summary_words": 32, "skills": 16, "projects": 1, "bullet_chars": 130},
    {"roles": 3, "bullets": 2, "summary_words": 28, "skills": 14, "projects": 0, "bullet_chars": 120},
    {"roles": 2, "bullets": 2, "summary_words": 24, "skills": 12, "projects": 0, "bullet_chars": 110},
    {"roles": 2, "bullets": 1, "summary_words": 20, "skills": 10, "projects": 0, "bullet_chars": 100},
    {"roles": 2, "bullets": 1, "summary_words": 16, "skills": 8, "projects": 0, "bullet_chars": 90},
    {"roles": 1, "bullets": 1, "summary_words": 14, "skills": 6, "projects": 0, "bullet_chars": 80},
]


def _profile_has_content(profile: Profile | None) -> bool:
    if profile is None:
        return False
    return bool(
        profile.name
        or profile.summary
        or profile.skills
        or profile.experience
        or profile.projects
        or profile.education
        or profile.raw_text.strip()
    )


def _profile_to_doc(profile: Profile) -> dict[str, Any]:
    return {
        "name": profile.name or "Candidate",
        "email": profile.email or "",
        "phone": profile.phone or "",
        "location": profile.location or "",
        "links": profile.links or [],
        "summary": profile.summary or "",
        "skills": profile.skills or [],
        "experience": profile.experience or [],
        "projects": profile.projects or [],
        "education": profile.education or [],
    }


def _merge_memories(doc: dict[str, Any], memories: list[Memory]) -> dict[str, Any]:
    """Layer coach-learned facts onto the existing profile without replacing it."""
    if not memories:
        return doc
    skill_mem = [m.content for m in memories if m.kind == "skill"]
    if skill_mem:
        skills = list(dict.fromkeys([*(doc.get("skills") or []), *skill_mem]))
        doc["skills"] = skills

    extra_facts = [m.content for m in memories if m.kind != "skill"]
    if not extra_facts:
        return doc

    experience = doc.get("experience") or []
    if experience and isinstance(experience[0], dict):
        bullets = experience[0].setdefault("highlights", [])
        existing = {str(b).strip().lower() for b in bullets}
        for fact in extra_facts[:5]:
            if fact.strip().lower() not in existing:
                bullets.append(fact)
                existing.add(fact.strip().lower())
    elif not doc.get("summary"):
        doc["summary"] = " ".join(extra_facts[:2])
    return doc


def _polish_with_llm(profile: Profile | None, memories: list[Memory]) -> dict[str, Any]:
    profile_text = profile_to_text(profile) if profile else ""
    memory_text = "\n".join(f"- ({m.kind}) {m.content}" for m in memories)
    chain = build_memory_provider()
    chain.reset()
    data = chain.chat_json(
        prompts.RESUME_PDF_SYSTEM,
        prompts.resume_pdf_user(profile_text, memory_text),
    )
    if chain.last_served:
        logger.info(
            "Resume PDF polish served by %s/%s",
            chain.last_served,
            chain.last_model,
        )
    if not isinstance(data, dict) or not data.get("name"):
        raise ValueError("LLM returned unusable resume structure")
    return data


def prepare_resume_document(
    profile: Profile | None, memories: list[Memory]
) -> dict[str, Any]:
    """Build structured resume data — profile is canonical; memories are layered on top."""
    if not _profile_has_content(profile) and not memories:
        raise ValueError(
            "No resume data yet — upload a resume or chat with the coach first."
        )

    if profile and _profile_has_content(profile):
        doc = _profile_to_doc(profile)
        doc = _merge_memories(doc, memories)
        return doc

    try:
        return _polish_with_llm(profile, memories)
    except Exception as exc:
        logger.warning("Resume LLM structuring failed: %s", exc)
        raise ValueError(
            "Not enough resume content to generate a PDF — upload your resume first."
        ) from exc


def _truncate_words(text: str, max_words: int) -> str:
    words = text.split()
    if len(words) <= max_words:
        return text.strip()
    return " ".join(words[:max_words]).rstrip(".,;") + "…"


def _truncate_chars(text: str, max_chars: int) -> str:
    text = text.strip()
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 1].rstrip() + "…"


def _condense_doc(doc: dict[str, Any], level: int) -> dict[str, Any]:
    """Progressively trim content so the PDF fits one page."""
    caps = _CONDENSE_LEVELS[min(level, len(_CONDENSE_LEVELS) - 1)]
    d = copy.deepcopy(doc)

    summary = (d.get("summary") or "").strip()
    if summary:
        d["summary"] = _truncate_words(summary, caps["summary_words"])

    skills = d.get("skills") or []
    if skills:
        d["skills"] = skills[: caps["skills"]]

    experience = []
    for exp in (d.get("experience") or [])[: caps["roles"]]:
        if not isinstance(exp, dict):
            continue
        item = copy.deepcopy(exp)
        highlights = item.get("highlights") or []
        trimmed = [
            _truncate_chars(str(b), caps["bullet_chars"])
            for b in highlights[: caps["bullets"]]
        ]
        item["highlights"] = trimmed
        experience.append(item)
    d["experience"] = experience

    if caps["projects"] <= 0:
        d["projects"] = []
    else:
        projects = []
        for proj in (d.get("projects") or [])[: caps["projects"]]:
            if not isinstance(proj, dict):
                continue
            item = copy.deepcopy(proj)
            if item.get("description"):
                item["description"] = _truncate_chars(str(item["description"]), 100)
            projects.append(item)
        d["projects"] = projects

    # Keep education compact — usually 1–2 entries fit easily.
    education = []
    for ed in (d.get("education") or [])[:2]:
        if isinstance(ed, dict):
            education.append(ed)
    d["education"] = education

    return d


def _safe_filename(name: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", name).strip().replace(" ", "_")
    return slug or "resume"


def _styles() -> dict[str, ParagraphStyle]:
    """Compact single-page layout — readable at ~9–10pt."""
    base = getSampleStyleSheet()
    return {
        "name": ParagraphStyle(
            "Name",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=16,
            leading=18,
            textColor=colors.HexColor(_SECTION_HEAD),
            spaceAfter=2,
        ),
        "contact": ParagraphStyle(
            "Contact",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=10,
            textColor=colors.HexColor(_MUTED),
            spaceAfter=4,
        ),
        "section": ParagraphStyle(
            "Section",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9.5,
            leading=11,
            textColor=colors.HexColor(_ACCENT),
            spaceBefore=5,
            spaceAfter=1,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9.5,
            leading=11.5,
            textColor=colors.HexColor(_SECTION_HEAD),
            alignment=TA_LEFT,
            spaceAfter=3,
        ),
        "role": ParagraphStyle(
            "Role",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9.5,
            leading=11,
            textColor=colors.HexColor(_SECTION_HEAD),
            spaceBefore=3,
            spaceAfter=1,
        ),
        "meta": ParagraphStyle(
            "Meta",
            parent=base["Normal"],
            fontName="Helvetica-Oblique",
            fontSize=8,
            leading=9.5,
            textColor=colors.HexColor(_MUTED),
            spaceAfter=1,
        ),
        "bullet": ParagraphStyle(
            "Bullet",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9,
            leading=10.5,
            leftIndent=10,
            bulletIndent=0,
            textColor=colors.HexColor(_SECTION_HEAD),
            spaceAfter=1,
        ),
    }


def _section(story: list, title: str, styles: dict[str, ParagraphStyle]) -> None:
    story.append(Paragraph(title.upper(), styles["section"]))
    story.append(
        HRFlowable(
            width="100%",
            thickness=0.5,
            color=colors.HexColor(_ACCENT),
            spaceBefore=0,
            spaceAfter=2,
        )
    )


def _escape(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _build_story(doc: dict[str, Any], styles: dict[str, ParagraphStyle]) -> list:
    story: list = []

    name = _escape(str(doc.get("name") or "Candidate"))
    story.append(Paragraph(name, styles["name"]))

    contact_parts = [
        p for p in [doc.get("email"), doc.get("phone"), doc.get("location")] if p
    ]
    links = doc.get("links") or []
    if links:
        contact_parts.extend(str(l) for l in links[:2])
    if contact_parts:
        story.append(Paragraph(_escape(" · ".join(contact_parts)), styles["contact"]))

    summary = (doc.get("summary") or "").strip()
    if summary:
        _section(story, "Summary", styles)
        story.append(Paragraph(_escape(summary), styles["body"]))

    skills = doc.get("skills") or []
    if skills:
        _section(story, "Skills", styles)
        story.append(Paragraph(_escape(", ".join(str(s) for s in skills)), styles["body"]))

    experience = doc.get("experience") or []
    if experience:
        _section(story, "Experience", styles)
        for exp in experience:
            if not isinstance(exp, dict):
                continue
            title = _escape(str(exp.get("title") or ""))
            company = _escape(str(exp.get("company") or ""))
            dates = _escape(str(exp.get("dates") or ""))
            head = " — ".join(x for x in [title, company] if x) or company or title
            if head and dates:
                story.append(Paragraph(f"{head} <font size='8' color='#4b5563'>({dates})</font>", styles["role"]))
            elif head:
                story.append(Paragraph(head, styles["role"]))
            elif dates:
                story.append(Paragraph(dates, styles["meta"]))
            for bullet in exp.get("highlights") or []:
                story.append(Paragraph(f"• {_escape(str(bullet))}", styles["bullet"]))

    projects = doc.get("projects") or []
    if projects:
        _section(story, "Projects", styles)
        for proj in projects:
            if not isinstance(proj, dict):
                continue
            pname = _escape(str(proj.get("name") or "Project"))
            desc = _escape(str(proj.get("description") or ""))
            tech = proj.get("tech") or []
            line = f"<b>{pname}</b> — {desc}" if desc else pname
            story.append(Paragraph(line, styles["body"]))
            if tech:
                story.append(
                    Paragraph(
                        _escape("Tools & methods: " + ", ".join(str(t) for t in tech[:6])),
                        styles["meta"],
                    )
                )

    education = doc.get("education") or []
    if education:
        _section(story, "Education", styles)
        for ed in education:
            if not isinstance(ed, dict):
                continue
            school = _escape(str(ed.get("school") or ""))
            degree = _escape(str(ed.get("degree") or ""))
            dates = _escape(str(ed.get("dates") or ""))
            line = " — ".join(x for x in [degree, school] if x) or school
            if line and dates:
                story.append(Paragraph(f"{line} ({dates})", styles["role"]))
            elif line:
                story.append(Paragraph(line, styles["role"]))

    return story


def _render_pdf_bytes(doc: dict[str, Any]) -> bytes:
    buf = io.BytesIO()
    pdf = SimpleDocTemplate(
        buf,
        pagesize=letter,
        leftMargin=0.5 * inch,
        rightMargin=0.5 * inch,
        topMargin=0.45 * inch,
        bottomMargin=0.45 * inch,
        title=f"{doc.get('name', 'Resume')} — Resume",
    )
    styles = _styles()
    pdf.build(_build_story(doc, styles))
    return buf.getvalue()


def _page_count(pdf_bytes: bytes) -> int:
    return len(PdfReader(io.BytesIO(pdf_bytes)).pages)


def render_resume_pdf(doc: dict[str, Any]) -> bytes:
    """Render a single-page ATS-friendly PDF, auto-condensing content if needed."""
    last_bytes = _render_pdf_bytes(_condense_doc(doc, len(_CONDENSE_LEVELS) - 1))
    for level in range(len(_CONDENSE_LEVELS)):
        condensed = _condense_doc(doc, level)
        pdf_bytes = _render_pdf_bytes(condensed)
        pages = _page_count(pdf_bytes)
        if pages <= 1:
            if level > 0:
                logger.info("Resume PDF fit to one page at condensation level %d", level)
            return pdf_bytes
        last_bytes = pdf_bytes

    logger.warning("Resume PDF still multi-page after max condensation — returning tightest")
    return last_bytes


def build_resume_pdf(
    profile: Profile | None,
    memories: list[Memory],
    job=None,
) -> tuple[bytes, str]:
    """Return (pdf_bytes, suggested_filename) using Claude-designed content."""
    from app.services.resume_designed import prepare_designed_resume_document

    doc = prepare_designed_resume_document(profile, memories, job)
    pdf_bytes = render_resume_pdf(doc)
    fname = f"{_safe_filename(str(doc.get('name', 'resume')))}_resume.pdf"
    return pdf_bytes, fname
