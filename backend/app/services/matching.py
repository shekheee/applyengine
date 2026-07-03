from __future__ import annotations

import numpy as np

from app import prompts
from app.llm import get_provider


def cosine(a: list[float], b: list[float]) -> float:
    va, vb = np.asarray(a, dtype=float), np.asarray(b, dtype=float)
    denom = float(np.linalg.norm(va) * np.linalg.norm(vb))
    return float(np.dot(va, vb) / denom) if denom else 0.0


def keyword_coverage(
    job_keywords: list[str], profile_skills: list[str], profile_text: str
) -> tuple[float, list[str], list[str]]:
    """Fraction of job keywords present in the candidate's profile."""
    skills_low = {s.lower() for s in profile_skills}
    text_low = profile_text.lower()
    matched, missing = [], []
    for kw in job_keywords:
        k = kw.lower()
        if k in skills_low or k in text_low:
            matched.append(kw)
        else:
            missing.append(kw)
    total = len(job_keywords) or 1
    return len(matched) / total, matched, missing


def semantic_similarity(profile_text: str, job_text: str) -> float:
    provider = get_provider()
    vecs = provider.embed([profile_text, job_text])
    return cosine(vecs[0], vecs[1])


def compute_fit(
    profile_text: str,
    job_text: str,
    job_keywords: list[str],
    profile_skills: list[str],
) -> dict:
    """Blend semantic similarity and keyword coverage into a 0-100 fit score."""
    sim = semantic_similarity(profile_text, job_text)  # 0..1
    cov, matched, missing = keyword_coverage(job_keywords, profile_skills, profile_text)

    # Weighted blend: keyword coverage is what ATS actually screens on, so it
    # carries slightly more weight than raw semantic similarity.
    score = round(100 * (0.45 * sim + 0.55 * cov), 1)

    return {
        "fit_score": score,
        "semantic_similarity": round(sim, 3),
        "keyword_coverage": round(cov, 3),
        "matched_keywords": matched,
        "missing_keywords": missing,
    }


def gap_analysis(profile_text: str, job_text: str, fit: dict) -> str:
    provider = get_provider()
    llm_text = provider.chat(prompts.FIT_SYSTEM, prompts.fit_user(profile_text, job_text))
    if llm_text.strip():
        return llm_text.strip()

    # Offline heuristic gap analysis.
    matched = ", ".join(fit["matched_keywords"][:10]) or "none detected"
    missing = ", ".join(fit["missing_keywords"][:10]) or "none — strong keyword match"
    verdict = (
        "Strong fit" if fit["fit_score"] >= 70
        else "Moderate fit" if fit["fit_score"] >= 45
        else "Stretch role"
    )
    return (
        f"**Fit score: {fit['fit_score']}/100** ({verdict})\n\n"
        f"**Strengths / matched keywords:** {matched}\n\n"
        f"**Gaps to address:** {missing}\n\n"
        f"Semantic similarity to the JD is {fit['semantic_similarity']:.0%} and you "
        f"cover {fit['keyword_coverage']:.0%} of the role's scanned keywords. "
        f"Prioritize surfacing the matched skills near the top of your resume and, "
        f"where truthful, add evidence for the missing ones."
    )
