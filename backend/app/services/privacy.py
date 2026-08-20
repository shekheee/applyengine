from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from app.models import Profile


PRIVACY_INSTRUCTION = """PRIVACY ALIASES:
- [CANDIDATE_NAME] and [FORMER_EMPLOYER_N] are private local aliases.
- Never infer, request, or reveal the real values behind them.
- In normal prose, say "the candidate", "you", or "a former employer" instead of printing an alias.
- Preserve aliases exactly in structured resume fields; the application restores them locally."""

_TITLE_WORDS = re.compile(
    r"\b(analyst|scientist|engineer|developer|manager|director|consultant|lead|"
    r"head|officer|architect|specialist|associate|intern|researcher|owner|"
    r"president|designer|administrator|coordinator|advisor|partner)\b",
    re.IGNORECASE,
)
_DATE_WORDS = re.compile(
    r"\b(?:19|20)\d{2}\b|\bpresent\b|\bcurrent\b|"
    r"\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|"
    r"jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|"
    r"dec(?:ember)?)\b",
    re.IGNORECASE,
)
_ORG_SUFFIX = re.compile(
    r"\b(ltd|limited|plc|llp|inc|incorporated|corp|corporation|company|co|"
    r"group|bank|university|college|consulting|consultancy|technologies|labs?)\.?$",
    re.IGNORECASE,
)
_SECTION = re.compile(
    r"^(summary|profile|skills|education|projects?|certifications?|awards?|"
    r"publications?|interests?|contact|references?)\b",
    re.IGNORECASE,
)
_EXPERIENCE_SECTION = re.compile(
    r"^(professional\s+)?(work\s+)?(experience|employment|career history)\b",
    re.IGNORECASE,
)
_LOCATION_WORDS = re.compile(
    r"\b(uk|united kingdom|england|scotland|wales|ireland|london|belfast|"
    r"remote|hybrid|onsite|on-site)\b",
    re.IGNORECASE,
)


def _clean_identifier(value: object) -> str:
    return " ".join(str(value or "").split()).strip(" ,;|–—-")


def _looks_like_person_name(value: str) -> bool:
    value = _clean_identifier(value)
    words = value.split()
    return (
        2 <= len(words) <= 5
        and len(value) <= 80
        and not any(char.isdigit() for char in value)
        and not re.search(r"[@:/]", value)
        and not _TITLE_WORDS.search(value)
        and not _SECTION.search(value)
    )


def _looks_like_company(value: str, *, contextual: bool = False) -> bool:
    value = _clean_identifier(value)
    words = value.split()
    if not value or len(words) > 10 or len(value) > 100:
        return False
    if re.search(r"[@:/]", value) or _DATE_WORDS.search(value):
        return False
    if _TITLE_WORDS.search(value) or _SECTION.search(value) or _LOCATION_WORDS.search(value):
        return False
    return bool(_ORG_SUFFIX.search(value) or contextual)


def _resume_source_identifiers(raw_text: str) -> tuple[str, list[str]]:
    """Extract only high-confidence identity fields locally before resume parsing."""
    lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
    name = ""
    if lines:
        first_part = re.split(r"\s+[|–—]\s+", lines[0], maxsplit=1)[0]
        if _looks_like_person_name(first_part):
            name = _clean_identifier(first_part)

    companies: list[str] = []
    in_experience = False
    experience_lines: list[str] = []
    for line in lines:
        clean = line.strip()
        heading = clean.strip(" \t-*•·●▪◦")
        if _EXPERIENCE_SECTION.match(heading):
            in_experience = True
            continue
        if in_experience and _SECTION.match(heading):
            break
        if in_experience:
            experience_lines.append(clean)

    for index, line in enumerate(experience_lines):
        if not line or len(line) > 180 or line.startswith(("-", "*", "•", "·", "●", "▪", "◦")):
            continue

        labelled = re.search(r"\b(?:company|employer|organisation|organization)\s*:\s*(.+)", line, re.I)
        if labelled:
            candidate = re.split(r"\s+[|–—]\s+|,\s*(?=(?:19|20)\d{2})", labelled.group(1))[0]
            if _looks_like_company(candidate, contextual=True):
                companies.append(_clean_identifier(candidate))
            continue

        at_match = re.search(r"\bat\s+(.+?)(?=\s+[|–—]\s+|,\s*(?:19|20)\d{2}|$)", line, re.I)
        if at_match and _looks_like_company(at_match.group(1), contextual=True):
            companies.append(_clean_identifier(at_match.group(1)))
            continue

        parts = [
            _clean_identifier(part)
            for part in re.split(r"\s+[|–—]\s+|\t+|,\s*", line)
            if _clean_identifier(part)
        ]
        if len(parts) >= 2:
            non_dates = [part for part in parts if not _DATE_WORDS.search(part)]
            candidates = [part for part in non_dates if _looks_like_company(part)]
            if not candidates and any(_TITLE_WORDS.search(part) for part in non_dates):
                candidates = [
                    part for part in non_dates if _looks_like_company(part, contextual=True)
                ]
            if not candidates and any(_DATE_WORDS.search(part) for part in parts):
                candidates = [
                    part for part in non_dates if _looks_like_company(part, contextual=True)
                ]
            companies.extend(candidates)
            continue

        previous = experience_lines[index - 1] if index else ""
        following = experience_lines[index + 1] if index + 1 < len(experience_lines) else ""
        contextual = bool(
            _TITLE_WORDS.search(previous)
            or _TITLE_WORDS.search(following)
            or _DATE_WORDS.search(previous)
            or _DATE_WORDS.search(following)
        )
        if _looks_like_company(line, contextual=contextual):
            companies.append(_clean_identifier(line))

    return name, list(dict.fromkeys(company for company in companies if company))


@dataclass(frozen=True)
class IdentifierPrivacy:
    """Fast, deterministic masking for candidate and former-employer names."""

    replacements: tuple[tuple[str, str], ...] = ()

    @classmethod
    def from_profile(cls, profile: Profile | None) -> "IdentifierPrivacy":
        if profile is None:
            return cls()
        pairs: list[tuple[str, str]] = []
        name = _clean_identifier(getattr(profile, "name", ""))
        if name:
            pairs.append((name, "[CANDIDATE_NAME]"))
        seen: set[str] = set()
        for item in getattr(profile, "experience", None) or []:
            if not isinstance(item, dict):
                continue
            company = _clean_identifier(item.get("company"))
            key = company.casefold()
            if company and key not in seen:
                seen.add(key)
                pairs.append((company, f"[FORMER_EMPLOYER_{len(seen)}]"))
        return cls(tuple(pairs))

    @classmethod
    def from_resume_source(cls, raw_text: str) -> "IdentifierPrivacy":
        name, companies = _resume_source_identifiers(raw_text)
        pairs: list[tuple[str, str]] = []
        if name:
            pairs.append((name, "[CANDIDATE_NAME]"))
        pairs.extend(
            (company, f"[FORMER_EMPLOYER_{index}]")
            for index, company in enumerate(companies, start=1)
        )
        return cls(tuple(pairs))

    def mask_text(self, value: str) -> str:
        text = str(value or "")
        for original, alias in sorted(self.replacements, key=lambda item: len(item[0]), reverse=True):
            pattern = rf"(?<!\w){re.escape(original)}(?!\w)"
            text = re.sub(pattern, alias, text, flags=re.IGNORECASE)
        return text

    def restore_text(self, value: str) -> str:
        text = str(value or "")
        for original, alias in self.replacements:
            text = re.sub(re.escape(alias), lambda _match, original=original: original, text, flags=re.IGNORECASE)
        return text

    def mask(self, value: Any) -> Any:
        return self._transform(value, self.mask_text)

    def restore(self, value: Any) -> Any:
        return self._transform(value, self.restore_text)

    def _transform(self, value: Any, transform: Any) -> Any:
        if isinstance(value, str):
            return transform(value)
        if isinstance(value, list):
            return [self._transform(item, transform) for item in value]
        if isinstance(value, tuple):
            return tuple(self._transform(item, transform) for item in value)
        if isinstance(value, dict):
            return {key: self._transform(item, transform) for key, item in value.items()}
        return value

    def protect_messages(self, messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        protected = self.mask(messages)
        if self.replacements and protected:
            content = protected[0].get("content", "")
            if isinstance(content, str):
                protected[0]["content"] = f"{content}\n\n{PRIVACY_INSTRUCTION}"
        return protected

    def protect_system(self, system: str) -> str:
        protected = self.mask_text(system)
        if self.replacements:
            return f"{protected}\n\n{PRIVACY_INSTRUCTION}"
        return protected


def private_profile_to_text(profile: Profile | None) -> tuple[str, IdentifierPrivacy]:
    if profile is None:
        return "", IdentifierPrivacy()
    from app.services.serialize import profile_to_text

    privacy = IdentifierPrivacy.from_profile(profile)
    return privacy.mask_text(profile_to_text(profile)), privacy
