"""A4 resume page constants — single source of truth for preview + PDF."""

from __future__ import annotations

# ISO A4 at 96 CSS px/in (210mm × 297mm)
A4_WIDTH_MM = 210
A4_HEIGHT_MM = 297
A4_WIDTH_PX = 794
A4_HEIGHT_PX = 1123
A4_ASPECT = A4_HEIGHT_PX / A4_WIDTH_PX  # ~1.414

# PDF points (72 pt/in): 210mm ≈ 595.28pt, 297mm ≈ 841.89pt
A4_WIDTH_PT = 595.28
A4_HEIGHT_PT = 841.89

A4_PAGE_CSS = """
@page {
  size: A4;
  margin: 14mm 16mm;
}
"""
