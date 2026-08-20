from __future__ import annotations

import logging
import re

from app import prompts
from app.llm import build_coach_provider
from app.services.resume_normalize import normalize_resume_data
from app.services.privacy import IdentifierPrivacy, PRIVACY_INSTRUCTION
from app.services.skills_vocab import ALIASES, SKILLS_SORTED

logger = logging.getLogger(__name__)

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


def _parse_json_with_fallback(system: str, user: str) -> dict:
    """Try every configured provider, then degrade to local heuristics."""
    try:
        chain = build_coach_provider()
        chain.reset()
        data = chain.chat_json(system, user)
        if isinstance(data, dict):
            return data
    except Exception as exc:
        logger.warning(
            "Structured document parsing failed across providers; using local fallback: %s",
            exc,
        )
    return {}


def parse_resume(raw_text: str) -> dict:
    """Parse a resume into structured fields (LLM first, heuristic fallback)."""
    privacy = IdentifierPrivacy.from_resume_source(raw_text)
    protected_text = privacy.mask_text(raw_text)
    data = _parse_json_with_fallback(
        f"{prompts.RESUME_PARSE_SYSTEM}\n\n{PRIVACY_INSTRUCTION}",
        prompts.resume_parse_user(protected_text),
    )
    data = privacy.restore(data)

    # Heuristic backfill for anything the LLM missed (or when using mock).
    lines = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]
    data.setdefault("email", _first(EMAIL_RE, raw_text))
    data.setdefault("phone", _first(PHONE_RE, raw_text))
    data.setdefault("name", lines[0] if lines else "")
    data.setdefault("location", "")
    data.setdefault("summary", "")
    for key in ("name", "email", "phone", "location", "summary"):
        if data.get(key) is None:
            data[key] = ""
    if not data.get("links"):
        data["links"] = sorted({m.group(0) for m in URL_RE.finditer(raw_text)})
    if not data.get("skills"):
        data["skills"] = extract_keywords(raw_text)
    for key in ("links", "skills", "experience", "projects", "education"):
        if data.get(key) is None:
            data[key] = []
    data.setdefault("experience", [])
    data.setdefault("projects", [])
    data.setdefault("education", [])
    data["raw_text"] = raw_text
    return normalize_resume_data(data)


def parse_job(raw_text: str) -> dict:
    """Parse a job description into structured fields."""
    data = _parse_json_with_fallback(
        prompts.JOB_PARSE_SYSTEM, prompts.job_parse_user(raw_text)
    )

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
