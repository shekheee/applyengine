from __future__ import annotations

import html
import logging
import re
from typing import Any

from app import prompts
from app.llm.factory import build_coach_provider
from app.models import Job, Memory, Profile
from app.services.serialize import job_to_text, profile_to_text

logger = logging.getLogger(__name__)

DESIGN_MODEL_ID = "claude-opus-4-8"
RESUME_HTML_MAX_TOKENS = 16384
VALID_STYLES = frozenset({"editorial", "executive"})


def _memory_text(memories: list[Memory]) -> str:
    return "\n".join(f"- ({m.kind}) {m.content}" for m in memories)


def extract_html_document(raw: str) -> str:
    """Pull a complete HTML document from model output."""
    text = raw.strip()
    fence = re.search(r"```(?:html)?\s*(.*?)\s*```", text, re.DOTALL | re.IGNORECASE)
    if fence:
        text = fence.group(1).strip()
    for pattern in (
        r"(<!DOCTYPE html>.*?</html>)",
        r"(<html[^>]*>.*?</html>)",
    ):
        match = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
        if match:
            return match.group(1).strip()
    if text.lower().startswith("<!doctype") or text.lower().startswith("<html"):
        if "</html>" not in text.lower():
            if "</body>" not in text.lower():
                text = text + "\n</body>"
            text = text + "\n</html>"
        return text
    raise ValueError(
        "Model did not return a complete HTML document — try again or use a shorter base resume."
    )


def design_resume_html(
    profile: Profile | None,
    memories: list[Memory],
    job: Job | None = None,
    style: str = "editorial",
) -> tuple[str, str | None, str | None]:
    """Generate a self-contained HTML resume via the coach fallback chain."""
    if not profile and not memories:
        raise ValueError(
            "No resume data yet — upload a resume or chat with the coach first."
        )

    style_key = style if style in VALID_STYLES else "editorial"
    profile_text = profile_to_text(profile) if profile else ""
    memory_text = _memory_text(memories)
    job_text = job_to_text(job) if job else ""

    chain = build_coach_provider(DESIGN_MODEL_ID)
    chain.reset()
    out = chain.chat_messages(
        [
            {"role": "system", "content": prompts.RESUME_HTML_SYSTEM},
            {
                "role": "user",
                "content": prompts.resume_designed_user(
                    profile_text, memory_text, job_text, style=style_key
                ),
            },
        ],
        max_tokens=RESUME_HTML_MAX_TOKENS,
    )
    document = extract_html_document(out)
    if chain.last_served:
        logger.info(
            "HTML resume served by %s/%s (job=%s, bytes=%d)",
            chain.last_served,
            chain.last_model,
            job.id if job else None,
            len(document),
        )
    return document, chain.last_served, chain.last_model


def refit_html_for_one_page(html: str, page_count: int) -> str:
    """Ask Claude to redesign overflowing HTML for one page (PDF export path)."""
    chain = build_coach_provider(DESIGN_MODEL_ID)
    chain.reset()
    out = chain.chat_messages(
        [
            {"role": "system", "content": prompts.RESUME_HTML_SYSTEM},
            {"role": "user", "content": prompts.resume_html_fit_user(html, page_count)},
        ],
        max_tokens=RESUME_HTML_MAX_TOKENS,
    )
    return extract_html_document(out)


def _refit_html_with_llm(html: str, page_count: int) -> tuple[str, str | None, str | None]:
    """Legacy alias — refit for one page."""
    chain = build_coach_provider(DESIGN_MODEL_ID)
    chain.reset()
    out = chain.chat_messages(
        [
            {"role": "system", "content": prompts.RESUME_HTML_SYSTEM},
            {"role": "user", "content": prompts.resume_html_fit_user(html, page_count)},
        ],
        max_tokens=RESUME_HTML_MAX_TOKENS,
    )
    return extract_html_document(out), chain.last_served, chain.last_model


def design_resume_html_fitted(
    profile: Profile | None,
    memories: list[Memory],
    job: Job | None = None,
    style: str = "editorial",
) -> tuple[str, str | None, str | None, int]:
    """Generate premium Design Lab HTML — no CSS destruction at design time."""
    html_doc, provider, model = design_resume_html(profile, memories, job, style=style)
    return html_doc, provider, model, 0


def pdf_page_count(pdf_bytes: bytes) -> int:
    from app.services.resume_html_fit import pdf_page_count as _count

    return _count(pdf_bytes)


def profile_to_base_html(profile: Profile) -> str:
    """Simple ATS-friendly HTML from the uploaded base profile (no AI rewrite)."""
    name = html.escape(profile.name or "Candidate")
    contact = " · ".join(
        html.escape(str(x))
        for x in [profile.email, profile.phone, profile.location, *(profile.links or [])[:2]]
        if x
    )
    sections: list[str] = []

    if profile.summary:
        sections.append(
            f"<section><h2>Summary</h2><p>{html.escape(profile.summary)}</p></section>"
        )
    if profile.skills:
        skills = ", ".join(html.escape(str(s)) for s in profile.skills)
        sections.append(f"<section><h2>Skills</h2><p>{skills}</p></section>")
    if profile.experience:
        items: list[str] = []
        for exp in profile.experience:
            if not isinstance(exp, dict):
                continue
            title = html.escape(str(exp.get("title") or ""))
            company = html.escape(str(exp.get("company") or ""))
            dates = html.escape(str(exp.get("dates") or ""))
            head = " — ".join(x for x in [title, company] if x)
            bullets = "".join(
                f"<li>{html.escape(str(b))}</li>"
                for b in (exp.get("highlights") or [])
            )
            items.append(
                f"<article><h3>{head}"
                f"{f' <span class=\"dates\">({dates})</span>' if dates else ''}"
                f"</h3>{f'<ul>{bullets}</ul>' if bullets else ''}</article>"
            )
        sections.append(f"<section><h2>Experience</h2>{''.join(items)}</section>")
    if profile.projects:
        items = []
        for proj in profile.projects:
            if not isinstance(proj, dict):
                continue
            pname = html.escape(str(proj.get("name") or "Project"))
            desc = html.escape(str(proj.get("description") or ""))
            items.append(f"<article><h3>{pname}</h3><p>{desc}</p></article>")
        sections.append(f"<section><h2>Projects</h2>{''.join(items)}</section>")
    if profile.education:
        items = []
        for ed in profile.education:
            if not isinstance(ed, dict):
                continue
            line = " — ".join(
                html.escape(str(x))
                for x in [ed.get("degree"), ed.get("school")]
                if x
            )
            dates = html.escape(str(ed.get("dates") or ""))
            items.append(
                f"<p><strong>{line}</strong>"
                f"{f' ({dates})' if dates else ''}</p>"
            )
        sections.append(f"<section><h2>Education</h2>{''.join(items)}</section>")

    body = "\n".join(sections)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>{name} — Resume</title>
<style>
  @page {{ size: A4; margin: 12mm 14mm; }}
  body {{ font-family: Georgia, 'Times New Roman', serif; font-size: 9.5pt; color: #1a1a2e; line-height: 1.28; max-width: 182mm; margin: 0 auto; }}
  h1 {{ font-size: 17pt; margin: 0 0 2px; color: #1a1a2e; }}
  .contact {{ color: #4b5563; font-size: 8.5pt; margin-bottom: 8px; }}
  h2 {{ font-size: 10pt; text-transform: uppercase; letter-spacing: 0.05em; color: #4338ca; border-bottom: 1px solid #4338ca; margin: 8px 0 4px; padding-bottom: 1px; }}
  h3 {{ font-size: 9.5pt; margin: 5px 0 1px; }}
  .dates {{ font-weight: normal; color: #4b5563; font-size: 8pt; }}
  ul {{ margin: 1px 0 4px 16px; padding: 0; }}
  li {{ margin-bottom: 1px; font-size: 9pt; }}
  @media print {{ body {{ max-width: none; }} }}
</style>
</head>
<body>
<header><h1>{name}</h1>{f'<p class="contact">{contact}</p>' if contact else ''}</header>
{body}
</body>
</html>"""
