from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

_playwright_ok: bool | None = None
_chromium_launch_error: str | None = None

CHROMIUM_ARGS = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
]

_BROWSER_PATH_CANDIDATES = (
    os.environ.get("PLAYWRIGHT_BROWSERS_PATH"),
    "/opt/render/project/src/backend/pw-browsers",
    "/app/pw-browsers",
)


def _configure_browser_path() -> str | None:
    """Pin Chromium to a path installed at build time (Render/Docker)."""
    for path in _BROWSER_PATH_CANDIDATES:
        if path and os.path.isdir(path):
            os.environ["PLAYWRIGHT_BROWSERS_PATH"] = path
            return path
    return None


def _install_browsers_at_runtime() -> None:
    """One-time Chromium download when build-time install is missing (Render native Python)."""
    import subprocess
    import sys

    path = "/opt/render/project/src/backend/pw-browsers"
    os.makedirs(path, exist_ok=True)
    os.environ["PLAYWRIGHT_BROWSERS_PATH"] = path
    logger.info("Installing Playwright Chromium to %s at runtime…", path)
    subprocess.run(
        [sys.executable, "-m", "playwright", "install", "chromium"],
        check=True,
        env={**os.environ, "PLAYWRIGHT_BROWSERS_PATH": path},
    )
    global _playwright_ok
    _playwright_ok = None


def playwright_available() -> bool:
    """Check once whether Chromium + Playwright are usable."""
    global _playwright_ok, _chromium_launch_error
    if _playwright_ok is not None:
        return _playwright_ok
    browser_path = _configure_browser_path()
    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=CHROMIUM_ARGS)
            browser.close()
        _playwright_ok = True
        _chromium_launch_error = None
        if browser_path:
            logger.info("Playwright Chromium ready at %s", browser_path)
    except Exception as exc:
        err = str(exc)
        if "Executable doesn't exist" in err or "playwright install" in err.lower():
            try:
                _install_browsers_at_runtime()
                with sync_playwright() as p:
                    browser = p.chromium.launch(headless=True, args=CHROMIUM_ARGS)
                    browser.close()
                _playwright_ok = True
                _chromium_launch_error = None
                logger.info("Playwright Chromium ready after runtime install")
                return True
            except Exception as exc2:
                err = str(exc2)
        logger.info("Playwright/Chromium unavailable: %s", err)
        _playwright_ok = False
        _chromium_launch_error = err
    return _playwright_ok


def playwright_status() -> dict:
    """Diagnostic payload for health checks."""
    browser_path = _configure_browser_path()
    available = playwright_available()
    return {
        "available": available,
        "engine": "playwright-chromium" if available else "unavailable",
        "browser_path": browser_path,
        "browser_path_exists": bool(browser_path and os.path.isdir(browser_path)),
        "error": None if available else _chromium_launch_error,
    }


def html_to_pdf_playwright(html: str) -> bytes:
    """High-fidelity A4 PDF via headless Chromium — preserves modern CSS."""
    _configure_browser_path()
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
