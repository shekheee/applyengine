from __future__ import annotations

import logging
import re

from app.models import Job
from app.services.resume_html import refit_html_for_one_page
from app.services.resume_html_fit import condense_html, pdf_page_count
from app.services.resume_templates import render_resume_template

logger = logging.getLogger(__name__)

_MAX_LLM_REFIT = 1
_MAX_LIGHT_CONDENSE = 2


def render_html_to_pdf(html: str) -> tuple[bytes, str]:
    """Render HTML to PDF via Playwright/Chromium (required for designed resumes)."""
    from app.services.resume_playwright_pdf import (
        html_to_pdf_playwright,
        playwright_available,
    )

    if not playwright_available():
        raise RuntimeError(
            "Chromium PDF renderer unavailable on server — designed resume export requires "
            "Playwright. Contact support or retry after redeploy."
        )
    try:
        return html_to_pdf_playwright(html), "playwright-chromium"
    except Exception as exc:
        raise RuntimeError(f"Chromium PDF render failed: {exc}") from exc


def html_to_pdf_one_page(
    html: str,
    *,
    structured: dict | None = None,
    style: str = "editorial",
    job: Job | None = None,
) -> tuple[bytes, str, str, int]:
    """Render HTML to a single A4 PDF page.

    Returns (pdf_bytes, engine_name, export_html_used, fit_pass).
    fit_pass: 0 = fit on first try, 1+ = refit/condense level used.
    """
    current = html
    engine = "unknown"
    job_obj = job

    for attempt in range(_MAX_LLM_REFIT + 1):
        pdf, engine = render_html_to_pdf(current)
        pages = pdf_page_count(pdf)
        if pages <= 1:
            return pdf, engine, current, attempt
        if attempt < _MAX_LLM_REFIT:
            logger.info("Resume PDF is %d pages (%s) — refit attempt %d", pages, engine, attempt + 1)
            if structured:
                current = render_resume_template(
                    structured, style=style, job=job_obj, compact=True
                )
            else:
                current = refit_html_for_one_page(current, pages)

    for level in range(1, _MAX_LIGHT_CONDENSE + 1):
        if structured:
            candidate = render_resume_template(
                structured, style=style, job=job_obj, compact=True
            )
            candidate = condense_html(candidate, level)
        else:
            candidate = condense_html(html, level)
        pdf, engine = render_html_to_pdf(candidate)
        if pdf_page_count(pdf) <= 1:
            logger.info("Resume fit to one A4 page via condensation level %d", level)
            return pdf, engine, candidate, level
        current = candidate

    logger.warning("Resume still multi-page after refit — returning tightest A4 render")
    pdf, engine = render_html_to_pdf(current)
    return pdf, engine, current, _MAX_LIGHT_CONDENSE
