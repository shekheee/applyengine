from __future__ import annotations

from app import prompts
from app.llm import get_provider


def tailor_resume(profile_text: str, job_text: str, keywords: list[str]) -> str:
    provider = get_provider()
    out = provider.chat(
        prompts.TAILOR_RESUME_SYSTEM,
        prompts.tailor_resume_user(profile_text, job_text, keywords),
    )
    if out.strip():
        return out.strip()

    # Offline template: keep the real resume, prepend a keyword-optimized header.
    kw = ", ".join(keywords[:12])
    header = (
        "PROFESSIONAL SUMMARY\n"
        f"Data Scientist / AI Engineer with hands-on experience across {kw}.\n\n"
        "CORE SKILLS\n"
        f"{kw}\n\n"
        "----------------------------------------\n"
    )
    return header + profile_text


def cover_letter(profile_text: str, job_text: str, company: str, title: str) -> str:
    provider = get_provider()
    out = provider.chat(
        prompts.COVER_LETTER_SYSTEM, prompts.cover_letter_user(profile_text, job_text)
    )
    if out.strip():
        return out.strip()

    company = company or "your team"
    title = title or "this role"
    return (
        f"Dear Hiring Team at {company},\n\n"
        f"I'm excited to apply for {title}. My background in data science and AI "
        "engineering maps directly to what you're building, and I'd bring immediate, "
        "measurable impact.\n\n"
        "Across my work I've shipped models and data products end to end — from "
        "framing the problem and engineering features to deploying and monitoring "
        "in production. I care about rigor (clean experiments, honest evals) and "
        "about outcomes that move real metrics.\n\n"
        f"I'd love to discuss how I can help {company} reach its goals. Thank you "
        "for your consideration.\n\nSincerely,\n"
    )


def interview_prep(profile_text: str, job_text: str) -> str:
    provider = get_provider()
    out = provider.chat(
        prompts.INTERVIEW_PREP_SYSTEM, prompts.interview_prep_user(profile_text, job_text)
    )
    if out.strip():
        return out.strip()

    return (
        "## Likely interview questions\n\n"
        "1. Walk me through an ML project you owned end to end.\n"
        "2. How do you validate a model beyond a single accuracy number?\n"
        "3. Explain the bias-variance tradeoff and how you diagnose each.\n"
        "4. How would you design an A/B test for a new model, and what could bias it?\n"
        "5. Describe a data pipeline you built and where it could fail.\n"
        "6. How do you monitor a model in production for drift?\n"
        "7. Tell me about a time you disagreed with a stakeholder on metrics.\n\n"
        "## STAR outlines (fill with your real examples)\n\n"
        "- **End-to-end project:** Situation → the problem & stakes; Task → your goal & "
        "metric; Action → data, modeling, deployment choices; Result → quantified impact.\n"
        "- **Stakeholder disagreement:** frame the tradeoff, the data you brought, the "
        "resolution, and what shipped.\n"
        "- **Production incident / drift:** how you detected it, root-caused it, and "
        "the guardrail you added.\n"
    )
