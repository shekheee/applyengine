from __future__ import annotations

import io
import logging

logger = logging.getLogger(__name__)


def html_to_pdf_bytes(html: str) -> tuple[bytes, str]:
    """Convert HTML to PDF. Returns (pdf_bytes, engine_name)."""
    # xhtml2pdf is pure Python and works on Render without system deps.
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
