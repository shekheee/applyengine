from __future__ import annotations

import logging
from functools import lru_cache

from app.config import get_settings
from app.llm.base import LLMProvider
from app.llm.coach_chain import CoachFallbackChain
from app.llm.coach_models import (
    available_coach_models,
    default_coach_model_id,
    provider_for_model,
    validate_coach_model,
)

logger = logging.getLogger(__name__)


def _build_openai(s, *, model: str | None = None):
    from app.llm.openai_provider import OpenAIProvider

    return OpenAIProvider(
        api_key=s.openai_api_key,
        chat_model=model or s.openai_chat_model,
        embed_model=s.openai_embed_model,
    )


def _build_anthropic(s, *, coach: bool = False, model: str | None = None):
    from app.llm.anthropic_provider import AnthropicProvider

    default = s.anthropic_coach_model if coach else s.anthropic_chat_model
    return AnthropicProvider(
        api_key=s.anthropic_api_key,
        chat_model=model or default,
        openai_api_key=s.openai_api_key,
        openai_embed_model=s.openai_embed_model,
    )


def _build_gemini(s, *, model: str | None = None):
    from app.llm.gemini_provider import GeminiProvider

    key = s.resolved_gemini_api_key
    if not key:
        return None
    return GeminiProvider(api_key=key, chat_model=model or s.gemini_coach_model)


def _provider_builder(s, name: str, *, model: str | None = None):
    if name == "openai" and s.openai_api_key:
        return _build_openai(s, model=model)
    if name == "anthropic" and s.anthropic_api_key:
        return _build_anthropic(s, coach=True, model=model)
    if name == "gemini":
        return _build_gemini(s, model=model)
    return None


def _coach_providers_for_chain(s) -> list:
    providers = []
    for name in s.coach_provider_chain_list:
        provider = _provider_builder(s, name)
        if provider is not None:
            providers.append(provider)
    return providers


def build_coach_provider(selected_model: str | None = None) -> CoachFallbackChain:
    """Build a fallback chain, optionally prioritizing a user-selected model."""
    s = get_settings()
    model_id = validate_coach_model(selected_model, s)

    if not model_id:
        providers = _coach_providers_for_chain(s)
    else:
        primary_name = provider_for_model(model_id, s)
        primary = _provider_builder(s, primary_name, model=model_id)
        if primary is None:
            raise RuntimeError(f"Provider '{primary_name}' is not configured")

        providers = [primary]
        seen = {primary_name}
        for name in s.coach_provider_chain_list:
            if name in seen:
                continue
            fallback = _provider_builder(s, name)
            if fallback is not None:
                providers.append(fallback)
                seen.add(name)

    if not providers:
        raise RuntimeError(
            "No coach providers configured — set API keys and COACH_PROVIDER_CHAIN"
        )
    return CoachFallbackChain(providers)


def resolved_memory_model_id() -> str | None:
    """Primary model for memory extraction (validated against configured providers)."""
    s = get_settings()
    allowed = {m.id for m in available_coach_models(s)}
    if not allowed:
        return None
    preferred = (s.memory_model or "").strip()
    if preferred and preferred in allowed:
        return preferred
    if preferred and preferred not in allowed:
        logger.warning(
            "MEMORY_MODEL '%s' is not available — falling back", preferred
        )
    for mid in (s.anthropic_coach_model, s.openai_chat_model, s.gemini_coach_model):
        if mid in allowed:
            return mid
    return next(iter(allowed), None)


def build_memory_provider() -> CoachFallbackChain:
    """Fallback chain for memory extraction — primary model from MEMORY_MODEL env."""
    return build_coach_provider(resolved_memory_model_id())


@lru_cache
def get_memory_provider() -> CoachFallbackChain:
    return build_memory_provider()


def list_coach_models() -> list[dict]:
    return [
        {
            "id": m.id,
            "label": m.label,
            "provider": m.provider,
            "provider_label": m.provider_label,
            "is_default": m.is_default,
        }
        for m in available_coach_models()
    ]


def default_model_id() -> str:
    return default_coach_model_id()


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


def get_coach_provider() -> CoachFallbackChain:
    """Default chain (no user override). Kept for health checks."""
    return build_coach_provider(None)
