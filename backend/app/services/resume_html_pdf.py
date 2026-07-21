from __future__ import annotations

import io
import logging

from app.services.resume_html_fit import condense_html, pdf_page_count

logger = logging.getLogger(__name__)


def html_to_pdf_bytes(html: str) -> tuple[bytes, str]:
    """Convert HTML to PDF. Returns (pdf_bytes, engine_name)."""
    try:
        from xhtml2pdf import pisa

        buf = io.BytesIO()
        status = pisa.CreatePDF(html, dest=buf, encoding="utf-8")
        if status.err:
            raise RuntimeError(f"xhtml2pdf reported {status.err} errors")
        pdf = buf.getvalue()
        if pdf:
            return pdf, "xhtml2pdf"
    except Exception as exc:
        logger.warning("xhtml2pdf failed: %s", exc)

    raise RuntimeError("Could not render PDF from HTML")


def html_to_pdf_one_page(html: str) -> tuple[bytes, str, str, int]:
    """Render HTML to a single-page PDF; condense until page count is 1.

    Returns (pdf_bytes, engine_name, fitted_html, condensation_level).
    """
    best_pdf: bytes | None = None
    best_html = html
    best_level = 0
    engine = "xhtml2pdf"

    from app.services.resume_html_fit import _FIT_LEVELS

    for level in range(len(_FIT_LEVELS)):
        candidate = condense_html(html, level)
        pdf, engine = html_to_pdf_bytes(candidate)
        pages = pdf_page_count(pdf)
        if pages <= 1:
            if level > 0:
                logger.info("HTML resume fit to one page at condensation level %d", level)
            return pdf, engine, candidate, level
        best_pdf = pdf
        best_html = candidate
        best_level = level

    logger.warning(
        "HTML resume still multi-page after max condensation (level %d) — returning tightest",
        best_level,
    )
    assert best_pdf is not None
    return best_pdf, engine, best_html, best_level
