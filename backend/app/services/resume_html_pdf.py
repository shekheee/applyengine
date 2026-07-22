from __future__ import annotations

import io
import logging
import re

from app.services.resume_html_fit import condense_html, pdf_page_count

logger = logging.getLogger(__name__)

_MAX_LLM_REFIT = 2
_MAX_LIGHT_CONDENSE = 2


def _sanitize_html_for_xhtml(html: str) -> str:
    """Strip CSS/layout features that often break xhtml2pdf (degraded fallback only)."""
    out = html
    out = re.sub(r"display\s*:\s*flex[^;]*;", "display: block;", out, flags=re.I)
    out = re.sub(r"flex-wrap\s*:[^;]+;", "", out, flags=re.I)
    out = re.sub(r"gap\s*:[^;]+;", "", out, flags=re.I)
    out = re.sub(r"grid-template[^;]+;", "", out, flags=re.I)
    out = re.sub(r"--[a-z0-9-]+\s*:[^;]+;", "", out, flags=re.I)
    return out


def _html_to_pdf_xhtml2pdf(html: str) -> bytes:
    from xhtml2pdf import pisa

    sanitized = _sanitize_html_for_xhtml(html)
    buf = io.BytesIO()
    status = pisa.CreatePDF(sanitized, dest=buf, encoding="utf-8")
    if status.err:
        raise RuntimeError(f"xhtml2pdf reported {status.err} errors")
    pdf = buf.getvalue()
    if not pdf:
        raise RuntimeError("xhtml2pdf produced empty PDF")
    return pdf


def render_html_to_pdf(html: str) -> tuple[bytes, str]:
    """Render HTML to PDF. Prefer Playwright (Design Lab CSS fidelity)."""
    from app.services.resume_playwright_pdf import (
        html_to_pdf_playwright,
        playwright_available,
    )

    if playwright_available():
        try:
            return html_to_pdf_playwright(html), "playwright-chromium"
        except Exception as exc:
            logger.warning("Playwright PDF failed, trying xhtml2pdf: %s", exc)

    try:
        return _html_to_pdf_xhtml2pdf(html), "xhtml2pdf"
    except Exception as exc:
        raise RuntimeError(f"Could not render PDF from HTML: {exc}") from exc


def html_to_pdf_one_page(html: str) -> tuple[bytes, str, str, int]:
    """Render HTML to a single-page PDF preserving Design Lab quality.

    Strategy:
    1. Playwright render (or xhtml2pdf fallback)
    2. If multi-page → LLM redesign for one page (up to 2 attempts)
    3. Light CSS condensation only as last resort (levels 1–2)
    Does NOT destructively strip design CSS for preview storage.

    Returns (pdf_bytes, engine_name, export_html_used, fit_pass).
    fit_pass: 0 = fit on first try, 1+ = refit/condense level used.
    """
    from app.services.resume_html import refit_html_for_one_page

    current = html
    engine = "unknown"

    for attempt in range(_MAX_LLM_REFIT + 1):
        pdf, engine = render_html_to_pdf(current)
        pages = pdf_page_count(pdf)
        if pages <= 1:
            return pdf, engine, current, attempt
        if attempt < _MAX_LLM_REFIT:
            logger.info(
                "Resume PDF is %d pages (%s) — LLM refit attempt %d",
                pages,
                engine,
                attempt + 1,
            )
            current = refit_html_for_one_page(current, pages)

    for level in range(1, _MAX_LIGHT_CONDENSE + 1):
        candidate = condense_html(html, level)
        pdf, engine = render_html_to_pdf(candidate)
        if pdf_page_count(pdf) <= 1:
            logger.info("Resume fit to one page via light condensation level %d", level)
            return pdf, engine, candidate, level
        current = candidate

    logger.warning("Resume still multi-page after refit — returning tightest render")
    pdf, engine = render_html_to_pdf(current)
    return pdf, engine, current, _MAX_LIGHT_CONDENSE
