from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_playwright_ok: bool | None = None


def playwright_available() -> bool:
    """Check once whether Chromium + Playwright are usable."""
    global _playwright_ok
    if _playwright_ok is not None:
        return _playwright_ok
    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            browser.close()
        _playwright_ok = True
    except Exception as exc:
        logger.info("Playwright/Chromium unavailable: %s", exc)
        _playwright_ok = False
    return _playwright_ok


def html_to_pdf_playwright(html: str) -> bytes:
    """High-fidelity Letter PDF via headless Chromium — preserves modern CSS."""
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            page = browser.new_page()
            page.set_content(html, wait_until="networkidle")
            return page.pdf(
                format="Letter",
                print_background=True,
                prefer_css_page_size=True,
                margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
            )
        finally:
            browser.close()
