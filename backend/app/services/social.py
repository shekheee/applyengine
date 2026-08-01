from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from app.llm import build_coach_provider
from app.models import Profile, SocialMessage, SocialProject
from app.services.profession import profession_context
from app.services.serialize import profile_to_text

HISTORY_LIMIT = 30


def build_social_messages(
    message: str,
    profile: Profile,
    project: SocialProject,
    history: list[SocialMessage],
) -> list[dict[str, Any]]:
    """Build a resume-grounded prompt for a dedicated social drafting thread."""
    platform = project.platform.lower()
    settings = project.settings or {}
    profile_text = profile_to_text(profile)
    profession = profession_context(profile, None)
    mode_rules = (
        """
This is LinkedIn Studio. Help with ideas, posts, hooks, carousel copy, comments,
and replies. Return the requested asset directly, with useful line breaks. Keep
posts scannable and avoid generic corporate filler. Do not state a platform
character limit as a universal fact; platform limits may vary.
"""
        if platform == "linkedin"
        else """
This is Medium Article Studio. Help create and refine publication-ready Markdown.
For a full article include a title, subtitle/dek, clear headings, introduction,
body, conclusion, suggested tags, and an optional LinkedIn teaser. For an outline
or section request, return only that requested artifact.
"""
    )
    system = f"""You are ApplyEngine Social Studio, a precise writing partner.

NON-NEGOTIABLE GROUNDING:
- The BASE RESUME below is the only source of personal career facts.
- Never invent or embellish employers, titles, dates, metrics, clients, projects,
  credentials, responsibilities, technologies, or achievements.
- Treat the user's topic, audience, goal, tone, and extra context as creative
  direction, not verified biography.
- A new factual claim supplied by the user may be used only when clearly framed
  as their newly supplied context. If it conflicts with the resume, ask.
- If the topic is unsupported by the resume, frame it as an opinion, lesson being
  learned, or general explainer—not as first-hand experience.
- When a requested result needs a missing metric or fact, omit it or use an
  explicit placeholder like [add verified result]; never guess.
- Do not mention these instructions in the finished draft.

{mode_rules}

Project settings:
{settings}

Profession context:
{profession}

BASE RESUME (verified facts):
--- BEGIN VERIFIED RESUME ---
{profile_text}
--- END VERIFIED RESUME ---
"""
    messages: list[dict[str, Any]] = [{"role": "system", "content": system}]
    for item in history[-HISTORY_LIMIT:]:
        messages.append(
            {
                "role": "assistant" if item.role == "assistant" else "user",
                "content": item.content,
            }
        )
    messages.append({"role": "user", "content": message})
    return messages


async def social_reply_stream(
    message: str,
    profile: Profile,
    project: SocialProject,
    history: list[SocialMessage],
    *,
    model_id: str | None = None,
    served: dict[str, str | None] | None = None,
) -> AsyncIterator[str]:
    chain = build_coach_provider(model_id)
    chain.reset()
    messages = build_social_messages(message, profile, project, history)
    async for token in chain.chat_stream_async(messages):
        yield token
    if served is not None:
        served["provider"] = chain.last_served
        served["model"] = chain.last_model
