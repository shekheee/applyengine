from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_playwright_ok: bool | None = None
_chromium_launch_error: str | None = None

CHROMIUM_ARGS = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
]


def playwright_available() -> bool:
    """Check once whether Chromium + Playwright are usable."""
    global _playwright_ok, _chromium_launch_error
    if _playwright_ok is not None:
        return _playwright_ok
    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=CHROMIUM_ARGS)
            browser.close()
        _playwright_ok = True
        _chromium_launch_error = None
    except Exception as exc:
        logger.info("Playwright/Chromium unavailable: %s", exc)
        _playwright_ok = False
        _chromium_launch_error = str(exc)
    return _playwright_ok


def playwright_status() -> dict:
    """Diagnostic payload for health checks."""
    available = playwright_available()
    return {
        "available": available,
        "engine": "playwright-chromium" if available else "unavailable",
        "error": None if available else _chromium_launch_error,
    }


def html_to_pdf_playwright(html: str) -> bytes:
    """High-fidelity A4 PDF via headless Chromium — preserves modern CSS."""
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=CHROMIUM_ARGS)
        try:
            page = browser.new_page()
            page.set_content(html, wait_until="networkidle")
            return page.pdf(
                format="A4",
                print_background=True,
                prefer_css_page_size=True,
                margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
            )
        finally:
            browser.close()
