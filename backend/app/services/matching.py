from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any

import numpy as np

from app import prompts
from app.llm import build_coach_provider, get_provider
from app.llm.base import local_embed
from app.services.skills_vocab import ALIASES, SKILLS

logger = logging.getLogger(__name__)

FIT_VERSION = "2.0"

_EXTRA_ALIASES = {
    "ai": "artificial intelligence",
    "ml": "machine learning",
    "amazon web services": "aws",
    "google cloud platform": "gcp",
    "k8s": "kubernetes",
    "powerbi": "power bi",
    "ms power bi": "power bi",
}

_STOP_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "been", "being", "but",
    "by", "can", "for", "from", "have", "having", "in", "into", "is", "it",
    "of", "on", "or", "our", "that", "the", "their", "this", "to", "using",
    "we", "will", "with", "you", "your", "ability", "candidate", "demonstrated",
    "excellent", "experience", "experienced", "knowledge", "proven", "role",
    "skills", "strong", "understanding", "work", "working",
}

_SENIORITY_RANK = {
    "intern": 0,
    "junior": 1,
    "mid": 2,
    "senior": 3,
    "staff": 4,
    "lead": 4,
    "principal": 5,
    "head": 5,
    "director": 5,
}


def cosine(a: list[float], b: list[float]) -> float:
    va, vb = np.asarray(a, dtype=float), np.asarray(b, dtype=float)
    denom = float(np.linalg.norm(va) * np.linalg.norm(vb))
    return float(np.dot(va, vb) / denom) if denom else 0.0


def _normalise_label(value: object) -> str:
    text = str(value or "").strip().lower()
    text = text.replace("–", "-").replace("—", "-")
    return re.sub(r"\s+", " ", text)


def _canonical_keyword(value: object) -> str:
    label = _normalise_label(value)
    aliases = {
        _normalise_label(alias): _normalise_label(canonical)
        for alias, canonical in {**ALIASES, **_EXTRA_ALIASES}.items()
    }
    # Resolve chained aliases (for example natural language processing -> nlp).
    for _ in range(3):
        replacement = aliases.get(label)
        if not replacement or replacement == label:
            break
        label = replacement
    return label


def _contains_phrase(text: str, phrase: str) -> bool:
    return _contains_normalised(_normalise_label(text), _normalise_label(phrase))


def _contains_normalised(text: str, phrase: str) -> bool:
    if not phrase:
        return False
    return bool(
        re.search(
            rf"(?<![a-z0-9]){re.escape(phrase)}(?![a-z0-9])",
            text,
        )
    )


def _concept_terms() -> dict[str, set[str]]:
    groups: dict[str, set[str]] = {}
    for term in [*SKILLS, *ALIASES.keys(), *_EXTRA_ALIASES.keys()]:
        canonical = _canonical_keyword(term)
        groups.setdefault(canonical, set()).add(_normalise_label(term))
        groups[canonical].add(canonical)
    return groups


_CONCEPT_TERMS = _concept_terms()


def _concepts_in_text(text: str, extra_terms: list[str] | None = None) -> set[str]:
    normalised_text = _normalise_label(text)
    groups = {key: set(values) for key, values in _CONCEPT_TERMS.items()}
    for term in extra_terms or []:
        canonical = _canonical_keyword(term)
        groups.setdefault(canonical, set()).update(
            {_normalise_label(term), canonical}
        )
    return {
        canonical
        for canonical, terms in groups.items()
        if any(_contains_normalised(normalised_text, term) for term in terms)
    }


def _normalise_keywords(job_keywords: list[str]) -> list[tuple[str, str]]:
    """Return the first display label for each canonical, non-empty keyword."""
    result: list[tuple[str, str]] = []
    seen: set[str] = set()
    for keyword in job_keywords:
        canonical = _canonical_keyword(keyword)
        if not canonical or canonical in seen:
            continue
        seen.add(canonical)
        result.append((str(keyword).strip(), canonical))
    return result


def keyword_coverage(
    job_keywords: list[str], profile_skills: list[str], profile_text: str
) -> tuple[float, list[str], list[str]]:
    """Boundary-safe, alias-aware coverage over deduplicated job keywords."""
    keywords = _normalise_keywords(job_keywords)
    if not keywords:
        return 0.0, [], []

    profile_concepts = {
        _canonical_keyword(skill) for skill in profile_skills if str(skill).strip()
    }
    profile_concepts.update(_concepts_in_text(profile_text, job_keywords))

    matched: list[str] = []
    missing: list[str] = []
    for display, canonical in keywords:
        if canonical in profile_concepts:
            matched.append(display)
        else:
            missing.append(display)
    return len(matched) / len(keywords), matched, missing


def _semantic_similarity_with_metadata(
    profile_text: str, job_text: str
) -> tuple[float, str, str]:
    provider_name = "local"
    model_name = "local-hashing-512"
    try:
        provider = get_provider()
        vecs = provider.embed([profile_text, job_text])
        if len(vecs) != 2 or not vecs[0] or not vecs[1]:
            raise ValueError("Embedding provider returned incomplete vectors")
        chain = getattr(provider, "embedding_chain", None)
        if chain is not None:
            provider_name = chain.last_served or provider_name
            model_name = chain.last_model or model_name
        else:
            provider_name = str(getattr(provider, "name", provider_name))
            model_name = str(
                getattr(provider, "embedding_model", None)
                or getattr(provider, "_embed_model", None)
                or model_name
            )
    except Exception as exc:
        logger.warning(
            "Remote embeddings unavailable; using deterministic local embeddings: %s",
            exc,
        )
        vecs = local_embed([profile_text, job_text])
    similarity = max(0.0, min(1.0, cosine(vecs[0], vecs[1])))
    return similarity, provider_name, model_name


def semantic_similarity(profile_text: str, job_text: str) -> float:
    return _semantic_similarity_with_metadata(profile_text, job_text)[0]


def _meaningful_tokens(text: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9][a-z0-9+#.-]*", text.lower())
        if len(token) > 2 and token not in _STOP_WORDS
    }


def _requirement_priority(requirement: str) -> tuple[str, float]:
    low = requirement.lower()
    if any(term in low for term in ("must", "required", "essential", "minimum")):
        return "must-have", 1.5
    if any(term in low for term in ("preferred", "desirable", "nice to have", "bonus")):
        return "preferred", 0.65
    return "standard", 1.0


def _required_years(requirement: str) -> float | None:
    match = re.search(
        r"\b(\d{1,2})(?:\s*[-–]\s*\d{1,2})?\s*\+?\s*(?:years?|yrs?)\b",
        requirement.lower(),
    )
    return float(match.group(1)) if match else None


def _experience_years(experience: list[dict[str, Any]]) -> float | None:
    intervals: list[tuple[int, int]] = []
    now = datetime.now(timezone.utc)
    current_month = now.year * 12 + now.month
    for role in experience:
        dates = str(role.get("dates", ""))
        years = [int(year) for year in re.findall(r"\b(?:19|20)\d{2}\b", dates)]
        if not years:
            continue
        start = years[0] * 12 + 1
        end = (
            current_month
            if re.search(r"present|current|now", dates, re.I)
            else years[-1] * 12 + 12
        )
        if end >= start:
            intervals.append((start, end))
    if not intervals:
        return None
    months: set[int] = set()
    for start, end in intervals:
        months.update(range(start, end + 1))
    return round(len(months) / 12, 1)


def _candidate_seniority(
    experience: list[dict[str, Any]], years: float | None
) -> tuple[int | None, str]:
    title_rank: int | None = None
    title_label = ""
    for role in experience:
        title = _normalise_label(role.get("title", ""))
        for label, rank in _SENIORITY_RANK.items():
            if _contains_phrase(title, label) and (
                title_rank is None or rank > title_rank
            ):
                title_rank, title_label = rank, label
    years_rank: int | None = None
    if years is not None:
        # Tenure alone can evidence seniority, but staff/lead requires an explicit
        # title signal rather than assuming level from elapsed years.
        years_rank = 3 if years >= 5 else 2 if years >= 3 else 1
    ranks = [rank for rank in (title_rank, years_rank) if rank is not None]
    if not ranks:
        return None, "Not enough dated experience to assess"
    rank = max(ranks)
    evidence = (
        f"{years:g} years represented"
        if years is not None
        else f"Highest title signal: {title_label}"
    )
    return rank, evidence


def _seniority_component(
    job_seniority: str, experience: list[dict[str, Any]]
) -> tuple[float | None, str]:
    target_label = _normalise_label(job_seniority)
    target_rank = _SENIORITY_RANK.get(target_label)
    if target_rank is None:
        return None, "Target seniority was not specified"
    years = _experience_years(experience)
    candidate_rank, evidence = _candidate_seniority(experience, years)
    if candidate_rank is None:
        return None, evidence
    difference = candidate_rank - target_rank
    if difference >= 0:
        score = 100.0
    elif difference == -1:
        score = 65.0
    elif difference == -2:
        score = 35.0
    else:
        score = 15.0
    return score, f"{evidence}; target level: {target_label}"


def _score_requirements(
    requirements: list[str],
    profile_text: str,
    profile_skills: list[str],
    job_keywords: list[str],
    experience: list[dict[str, Any]],
) -> tuple[float | None, list[dict[str, Any]]]:
    cleaned: list[str] = []
    seen_requirements: set[str] = set()
    for requirement in requirements:
        display = str(requirement).strip()
        normalised = _normalise_label(display).rstrip(".")
        if not display or normalised in seen_requirements:
            continue
        seen_requirements.add(normalised)
        cleaned.append(display)
    if not cleaned:
        return None, []

    profile_concepts = {
        _canonical_keyword(skill) for skill in profile_skills if str(skill).strip()
    }
    profile_concepts.update(_concepts_in_text(profile_text, job_keywords))
    profile_tokens = _meaningful_tokens(profile_text)
    profile_years = _experience_years(experience)
    details: list[dict[str, Any]] = []
    weighted_total = 0.0
    total_weight = 0.0

    for requirement in cleaned:
        priority, weight = _requirement_priority(requirement)
        req_concepts = _concepts_in_text(requirement, job_keywords)
        matched_terms = sorted(req_concepts & profile_concepts)
        missing_terms = sorted(req_concepts - profile_concepts)
        req_tokens = _meaningful_tokens(requirement)
        token_overlap = len(req_tokens & profile_tokens) / max(2, min(6, len(req_tokens)))
        token_score = min(1.0, token_overlap)
        if req_concepts:
            concept_score = len(matched_terms) / len(req_concepts)
            score = 0.85 * concept_score + 0.15 * token_score
        else:
            score = token_score

        required_years = _required_years(requirement)
        if required_years is not None and profile_years is not None:
            years_score = min(1.0, profile_years / required_years)
            score = 0.75 * score + 0.25 * years_score

        score_pct = round(max(0.0, min(1.0, score)) * 100, 1)
        status = "met" if score_pct >= 75 else "partial" if score_pct >= 40 else "gap"
        details.append(
            {
                "text": requirement,
                "priority": priority,
                "status": status,
                "score": score_pct,
                "matched_terms": matched_terms,
                "missing_terms": missing_terms,
            }
        )
        weighted_total += score_pct * weight
        total_weight += weight

    return round(weighted_total / total_weight, 1), details


def _component(
    label: str,
    score: float | None,
    base_weight: float,
    explanation: str,
) -> dict[str, Any]:
    return {
        "label": label,
        "score": None if score is None else round(score, 1),
        "base_weight": base_weight,
        "weight": 0.0,
        "available": score is not None,
        "explanation": explanation,
    }


def compute_fit(
    profile_text: str,
    job_text: str,
    job_keywords: list[str],
    profile_skills: list[str],
    *,
    job_requirements: list[str] | None = None,
    job_seniority: str = "",
    profile_experience: list[dict[str, Any]] | None = None,
) -> dict:
    """Compute a versioned, evidence-based fit score with auditable components."""
    requirements = job_requirements or []
    experience = profile_experience or []
    normalised_keywords = _normalise_keywords(job_keywords)

    similarity, embedding_provider, embedding_model = _semantic_similarity_with_metadata(
        profile_text, job_text
    )
    coverage, matched, missing = keyword_coverage(
        job_keywords, profile_skills, profile_text
    )
    requirement_score, requirement_details = _score_requirements(
        requirements, profile_text, profile_skills, job_keywords, experience
    )
    seniority_score, seniority_evidence = _seniority_component(
        job_seniority, experience
    )

    components = {
        "requirements": _component(
            "Role requirements", requirement_score, 45.0,
            "Weighted requirement-by-requirement evidence, with must-haves counting most.",
        ),
        "skills": _component(
            "Skills and keywords",
            coverage * 100 if normalised_keywords else None,
            25.0,
            f"{len(matched)} of {len(normalised_keywords)} deduplicated skills matched.",
        ),
        "seniority": _component(
            "Experience and seniority", seniority_score, 15.0, seniority_evidence,
        ),
        "semantic": _component(
            "Semantic alignment", similarity * 100, 15.0,
            f"Whole-document similarity via {embedding_provider}/{embedding_model}.",
        ),
    }

    available_weight = sum(
        component["base_weight"]
        for component in components.values()
        if component["available"]
    )
    score = 0.0
    for component in components.values():
        if not component["available"] or not available_weight:
            continue
        component["weight"] = round(component["base_weight"] * 100 / available_weight, 1)
        score += float(component["score"]) * component["base_weight"] / available_weight

    source_count = (
        int(bool(requirements))
        + int(bool(normalised_keywords))
        + int(_normalise_label(job_seniority) in _SENIORITY_RANK)
    )
    confidence = "high" if source_count == 3 else "medium" if source_count >= 1 else "low"
    breakdown = {
        "version": FIT_VERSION,
        "confidence": confidence,
        "components": components,
        "requirements": requirement_details,
        "embedding": {"provider": embedding_provider, "model": embedding_model},
    }

    return {
        "fit_score": round(max(0.0, min(100.0, score)), 1),
        "fit_version": FIT_VERSION,
        "fit_breakdown": breakdown,
        "semantic_similarity": round(similarity, 3),
        "keyword_coverage": round(coverage, 3),
        "matched_keywords": matched,
        "missing_keywords": missing,
    }


def _authoritative_fit_summary(fit: dict) -> str:
    raw_score = fit.get("fit_score", 0)
    score = float(raw_score)
    verdict = "Strong fit" if score >= 70 else "Moderate fit" if score >= 45 else "Stretch role"
    breakdown = fit.get("fit_breakdown", {})
    confidence = str(breakdown.get("confidence", "low")).capitalize()
    components = breakdown.get("components", {})
    component_lines = "\n".join(
        f"- {component['label']}: **{component['score']:.0f}%** "
        f"(weight {component['weight']:.0f}%)"
        for component in components.values()
        if component.get("available") and component.get("score") is not None
    )
    return (
        f"## Fit summary\n"
        f"**{raw_score}/100** — {verdict}. {confidence}-confidence Fit Score "
        f"v{fit.get('fit_version', FIT_VERSION)}.\n\n"
        f"## Score breakdown\n{component_lines or '- Breakdown unavailable'}"
    )


def gap_analysis(profile_text: str, job_text: str, fit: dict) -> str:
    authoritative_summary = _authoritative_fit_summary(fit)
    try:
        chain = build_coach_provider()
        chain.reset()
        llm_text = chain.chat_messages(
            [
                {"role": "system", "content": prompts.FIT_SYSTEM},
                {
                    "role": "user",
                    "content": prompts.fit_user(profile_text, job_text, fit),
                },
            ]
        )
        if llm_text.strip():
            return f"{authoritative_summary}\n\n{llm_text.strip()}"
    except Exception as exc:
        logger.warning(
            "AI gap analysis unavailable; using deterministic local analysis: %s",
            exc,
        )

    matched = ", ".join(fit["matched_keywords"][:10]) or "none detected"
    missing = ", ".join(fit["missing_keywords"][:10]) or "none — strong keyword match"
    return (
        f"{authoritative_summary}\n\n"
        f"## Strengths\n"
        f"- Matched skills: {matched}\n\n"
        f"## Gaps / how to improve\n"
        f"- Missing skills to surface if truthful: {missing}\n"
        f"- Add specific evidence for partial or unmet requirements rather than keywords alone."
    )
