from __future__ import annotations

from functools import lru_cache

from app.config import get_settings
from app.llm.base import LLMProvider


@lru_cache
def get_provider() -> LLMProvider:
    s = get_settings()
    provider = s.llm_provider.lower()

    if provider == "openai" and s.openai_api_key:
        from app.llm.openai_provider import OpenAIProvider

        return OpenAIProvider(
            api_key=s.openai_api_key,
            chat_model=s.openai_chat_model,
            embed_model=s.openai_embed_model,
        )

    if provider == "anthropic" and s.anthropic_api_key:
        from app.llm.anthropic_provider import AnthropicProvider

        return AnthropicProvider(
            api_key=s.anthropic_api_key,
            chat_model=s.anthropic_chat_model,
            openai_api_key=s.openai_api_key,
            openai_embed_model=s.openai_embed_model,
        )

    # Fallback: fully offline, deterministic. Keeps the app usable with no keys.
    from app.llm.mock_provider import MockProvider

    return MockProvider()
