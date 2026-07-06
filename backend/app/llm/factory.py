from __future__ import annotations

from functools import lru_cache

from app.config import get_settings
from app.llm.base import LLMProvider
from app.llm.coach_chain import CoachFallbackChain


def _build_openai(s):
    from app.llm.openai_provider import OpenAIProvider

    return OpenAIProvider(
        api_key=s.openai_api_key,
        chat_model=s.openai_chat_model,
        embed_model=s.openai_embed_model,
    )


def _build_anthropic(s, *, coach: bool = False):
    from app.llm.anthropic_provider import AnthropicProvider

    model = s.anthropic_coach_model if coach else s.anthropic_chat_model
    return AnthropicProvider(
        api_key=s.anthropic_api_key,
        chat_model=model,
        openai_api_key=s.openai_api_key,
        openai_embed_model=s.openai_embed_model,
    )


def _build_gemini(s):
    from app.llm.gemini_provider import GeminiProvider

    key = s.resolved_gemini_api_key
    if not key:
        return None
    return GeminiProvider(api_key=key, chat_model=s.gemini_coach_model)


def _coach_providers_for_chain(s) -> list:
    builders = {
        "openai": lambda: _build_openai(s) if s.openai_api_key else None,
        "anthropic": lambda: _build_anthropic(s, coach=True) if s.anthropic_api_key else None,
        "gemini": lambda: _build_gemini(s),
    }
    providers = []
    for name in s.coach_provider_chain_list:
        builder = builders.get(name)
        if not builder:
            continue
        provider = builder()
        if provider is not None:
            providers.append(provider)
    return providers


@lru_cache
def get_provider() -> LLMProvider:
    s = get_settings()
    provider = s.llm_provider.lower()

    if provider == "openai" and s.openai_api_key:
        return _build_openai(s)

    if provider == "anthropic" and s.anthropic_api_key:
        return _build_anthropic(s)

    from app.llm.mock_provider import MockProvider

    return MockProvider()


@lru_cache
def get_coach_provider() -> CoachFallbackChain:
    providers = _coach_providers_for_chain(get_settings())
    if not providers:
        from app.llm.mock_provider import MockProvider

        raise RuntimeError(
            "No coach providers configured — set API keys and COACH_PROVIDER_CHAIN"
        )
    return CoachFallbackChain(providers)
