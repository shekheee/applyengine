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

    kw = ", ".join(keywords[:12])
    header = (
        "PROFESSIONAL SUMMARY\n"
        f"Experienced professional with strengths across {kw}.\n\n"
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
        f"I'm excited to apply for {title}. My background aligns closely with what "
        "you're looking for, and I'd bring immediate, measurable impact.\n\n"
        "Across my career I've delivered results end to end — from framing the "
        "challenge and engaging stakeholders to executing and measuring outcomes. "
        "I care about rigor and about results that matter to the business.\n\n"
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
        "1. Tell me about yourself and why you're a strong fit for this role.\n"
        "2. Walk me through a significant project or initiative you led.\n"
        "3. Describe a challenging stakeholder situation and how you handled it.\n"
        "4. How do you approach a complex problem in your field?\n"
        "5. Tell me about a time you had to influence without authority.\n"
        "6. What methods or frameworks do you rely on most in your work?\n"
        "7. Tell me about a setback and what you learned.\n\n"
        "## STAR outlines (fill with your real examples)\n\n"
        "- **Key achievement:** Situation → stakes; Task → your goal; Action → what you did; "
        "Result → quantified impact.\n"
        "- **Stakeholder challenge:** frame the conflict, your approach, resolution, outcome.\n"
        "- **Complex scenario:** how you structured discovery, plan, risks, and success metrics.\n"
    )
