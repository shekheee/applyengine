from __future__ import annotations

import re

from app import prompts
from app.llm import get_provider
from app.services.skills_vocab import ALIASES, SKILLS_SORTED

EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE_RE = re.compile(r"(\+?\d[\d\s().-]{7,}\d)")
URL_RE = re.compile(r"(https?://[^\s)]+|(?:www\.|linkedin\.com|github\.com)[^\s)]+)")


def extract_keywords(text: str, limit: int = 40) -> list[str]:
    """Heuristic keyword extraction using curated professional vocabulary."""
    low = f" {text.lower()} "
    found: list[str] = []
    seen: set[str] = set()
    for skill in SKILLS_SORTED:
        # Word-ish boundary match; handles multi-word phrases too.
        pattern = r"(?<![a-z0-9])" + re.escape(skill) + r"(?![a-z0-9])"
        if re.search(pattern, low):
            canonical = ALIASES.get(skill, skill)
            if canonical not in seen:
                seen.add(canonical)
                found.append(canonical)
        if len(found) >= limit:
            break
    return found


def _first(pattern: re.Pattern, text: str) -> str:
    m = pattern.search(text)
    return m.group(0).strip() if m else ""


def parse_resume(raw_text: str) -> dict:
    """Parse a resume into structured fields (LLM first, heuristic fallback)."""
    provider = get_provider()
    data = provider.chat_json(
        prompts.RESUME_PARSE_SYSTEM, prompts.resume_parse_user(raw_text)
    )
    if not isinstance(data, dict):
        data = {}

    # Heuristic backfill for anything the LLM missed (or when using mock).
    lines = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]
    data.setdefault("email", _first(EMAIL_RE, raw_text))
    data.setdefault("phone", _first(PHONE_RE, raw_text))
    data.setdefault("name", lines[0] if lines else "")
    data.setdefault("location", "")
    data.setdefault("summary", "")
    if not data.get("links"):
        data["links"] = sorted({m.group(0) for m in URL_RE.finditer(raw_text)})
    if not data.get("skills"):
        data["skills"] = extract_keywords(raw_text)
    data.setdefault("experience", [])
    data.setdefault("projects", [])
    data.setdefault("education", [])
    data["raw_text"] = raw_text
    return data


def parse_job(raw_text: str) -> dict:
    """Parse a job description into structured fields."""
    provider = get_provider()
    data = provider.chat_json(prompts.JOB_PARSE_SYSTEM, prompts.job_parse_user(raw_text))
    if not isinstance(data, dict):
        data = {}

    lines = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]
    data.setdefault("title", lines[0] if lines else "")
    data.setdefault("company", "")
    data.setdefault("location", "")
    data.setdefault("seniority", "unknown")
    data.setdefault("summary", "")
    if not data.get("keywords"):
        data["keywords"] = extract_keywords(raw_text)
    if not data.get("requirements"):
        data["requirements"] = _heuristic_requirements(raw_text)
    data["raw_text"] = raw_text
    return data


def _heuristic_requirements(text: str) -> list[str]:
    """Pull bullet-like requirement lines when the LLM is unavailable."""
    reqs: list[str] = []
    for ln in text.splitlines():
        s = ln.strip(" \t-*•·o●▪◦")
        if not s:
            continue
        low = s.lower()
        looks_bulleted = ln.strip().startswith(("-", "*", "•", "·", "●", "▪", "◦"))
        mentions_req = any(
            k in low for k in ("experience", "proficient", "years", "degree",
                               "familiar", "knowledge", "ability", "strong")
        )
        if (looks_bulleted or mentions_req) and 3 <= len(s.split()) <= 40:
            reqs.append(s)
        if len(reqs) >= 15:
            break
    return reqs
