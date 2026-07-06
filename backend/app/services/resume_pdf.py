from __future__ import annotations

import io
import logging
import re
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer

from app import prompts
from app.llm.factory import build_memory_provider
from app.models import Memory, Profile
from app.services.serialize import profile_to_text

logger = logging.getLogger(__name__)

_SECTION_HEAD = "#1a1a2e"
_ACCENT = "#4338ca"
_MUTED = "#4b5563"


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
    if not memories:
        return doc
    skill_mem = [m.content for m in memories if m.kind == "skill"]
    other = [m.content for m in memories if m.kind != "skill"]
    skills = list(dict.fromkeys([*(doc.get("skills") or []), *skill_mem]))
    doc["skills"] = skills
    if other and not doc.get("summary"):
        doc["summary"] = " ".join(other[:3])
    elif other:
        highlights = doc.setdefault("experience", [])
        if highlights and isinstance(highlights[0], dict):
            bullets = highlights[0].setdefault("highlights", [])
            for fact in other[:3]:
                if fact not in bullets:
                    bullets.append(fact)
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
    """Build structured resume data from profile + memories, polishing with LLM if thin."""
    if not _profile_has_content(profile) and not memories:
        raise ValueError(
            "No resume data yet — upload a resume or chat with the coach first."
        )

    doc = _profile_to_doc(profile) if profile else {
        "name": "Candidate",
        "email": "",
        "phone": "",
        "location": "",
        "links": [],
        "summary": "",
        "skills": [],
        "experience": [],
        "projects": [],
        "education": [],
    }
    doc = _merge_memories(doc, memories)

    thin = (
        not doc.get("summary")
        and not doc.get("experience")
        and not doc.get("skills")
    )
    if thin or (profile and profile.raw_text and len(profile.raw_text) > len(profile_to_text(profile)) + 200):
        try:
            doc = _polish_with_llm(profile, memories)
        except Exception as exc:
            logger.warning("Resume LLM polish failed, using profile data: %s", exc)
            if profile and profile.raw_text.strip():
                doc["summary"] = doc.get("summary") or profile.raw_text[:600].strip()

    if not any(
        [
            doc.get("summary"),
            doc.get("skills"),
            doc.get("experience"),
            doc.get("projects"),
            doc.get("education"),
        ]
    ):
        raise ValueError(
            "Not enough resume content to generate a PDF — add more profile details."
        )
    return doc


def _safe_filename(name: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", name).strip().replace(" ", "_")
    return slug or "resume"


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "name": ParagraphStyle(
            "Name",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=22,
            leading=26,
            textColor=colors.HexColor(_SECTION_HEAD),
            spaceAfter=4,
        ),
        "contact": ParagraphStyle(
            "Contact",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9,
            leading=12,
            textColor=colors.HexColor(_MUTED),
            spaceAfter=10,
        ),
        "section": ParagraphStyle(
            "Section",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=14,
            textColor=colors.HexColor(_ACCENT),
            spaceBefore=10,
            spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            textColor=colors.HexColor(_SECTION_HEAD),
            alignment=TA_LEFT,
            spaceAfter=6,
        ),
        "role": ParagraphStyle(
            "Role",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=13,
            textColor=colors.HexColor(_SECTION_HEAD),
            spaceBefore=6,
            spaceAfter=2,
        ),
        "meta": ParagraphStyle(
            "Meta",
            parent=base["Normal"],
            fontName="Helvetica-Oblique",
            fontSize=9,
            leading=12,
            textColor=colors.HexColor(_MUTED),
            spaceAfter=4,
        ),
        "bullet": ParagraphStyle(
            "Bullet",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=10,
            leading=13,
            leftIndent=12,
            bulletIndent=0,
            textColor=colors.HexColor(_SECTION_HEAD),
            spaceAfter=2,
        ),
    }


def _section(story: list, title: str, styles: dict[str, ParagraphStyle]) -> None:
    story.append(Paragraph(title.upper(), styles["section"]))
    story.append(
        HRFlowable(
            width="100%",
            thickness=0.75,
            color=colors.HexColor(_ACCENT),
            spaceBefore=0,
            spaceAfter=6,
        )
    )


def _escape(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def render_resume_pdf(doc: dict[str, Any]) -> bytes:
    """Render structured resume data to a professional ATS-friendly PDF."""
    buf = io.BytesIO()
    pdf = SimpleDocTemplate(
        buf,
        pagesize=letter,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
        topMargin=0.65 * inch,
        bottomMargin=0.65 * inch,
        title=f"{doc.get('name', 'Resume')} — Resume",
    )
    styles = _styles()
    story: list = []

    name = _escape(str(doc.get("name") or "Candidate"))
    story.append(Paragraph(name, styles["name"]))

    contact_parts = [
        p
        for p in [
            doc.get("email"),
            doc.get("phone"),
            doc.get("location"),
        ]
        if p
    ]
    links = doc.get("links") or []
    if links:
        contact_parts.extend(str(l) for l in links[:3])
    if contact_parts:
        story.append(Paragraph(_escape(" · ".join(contact_parts)), styles["contact"]))

    summary = (doc.get("summary") or "").strip()
    if summary:
        _section(story, "Professional Summary", styles)
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
            if head:
                story.append(Paragraph(head, styles["role"]))
            if dates:
                story.append(Paragraph(dates, styles["meta"]))
            for bullet in exp.get("highlights") or []:
                story.append(
                    Paragraph(f"• {_escape(str(bullet))}", styles["bullet"])
                )

    projects = doc.get("projects") or []
    if projects:
        _section(story, "Projects", styles)
        for proj in projects:
            if not isinstance(proj, dict):
                continue
            pname = _escape(str(proj.get("name") or "Project"))
            desc = _escape(str(proj.get("description") or ""))
            tech = proj.get("tech") or []
            line = pname
            if desc:
                line = f"<b>{pname}</b> — {desc}"
            story.append(Paragraph(line, styles["body"]))
            if tech:
                story.append(
                    Paragraph(
                        _escape("Tech: " + ", ".join(str(t) for t in tech)),
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
            if line:
                story.append(Paragraph(line, styles["role"]))
            if dates:
                story.append(Paragraph(dates, styles["meta"]))

    story.append(Spacer(1, 0.2 * inch))
    pdf.build(story)
    return buf.getvalue()


def build_resume_pdf(profile: Profile | None, memories: list[Memory]) -> tuple[bytes, str]:
    """Return (pdf_bytes, suggested_filename)."""
    doc = prepare_resume_document(profile, memories)
    pdf_bytes = render_resume_pdf(doc)
    fname = f"{_safe_filename(str(doc.get('name', 'resume')))}_resume.pdf"
    return pdf_bytes, fname
