from __future__ import annotations

from dataclasses import dataclass

from app.config import Settings, get_settings


@dataclass(frozen=True)
class CoachModelOption:
    id: str
    label: str
    provider: str
    provider_label: str
    is_default: bool = False


_PROVIDER_LABELS = {
    "openai": "OpenAI",
    "anthropic": "Anthropic",
    "gemini": "Google",
}

_MODEL_LABELS = {
    "gpt-5.5": "GPT-5.5",
    "claude-opus-4-8": "Claude Opus 4.8",
    "gemini-3.1-pro-preview": "Gemini 3.1 Preview",
}


def _label_for(model_id: str) -> str:
    return _MODEL_LABELS.get(model_id, model_id)


def available_coach_models(settings: Settings | None = None) -> list[CoachModelOption]:
    """Return selectable coach models for configured providers only."""
    s = settings or get_settings()
    default_id = default_coach_model_id(s)
    options: list[CoachModelOption] = []

    if s.openai_api_key and "openai" in s.coach_provider_chain_list:
        mid = s.openai_chat_model
        options.append(
            CoachModelOption(
                id=mid,
                label=_label_for(mid),
                provider="openai",
                provider_label=_PROVIDER_LABELS["openai"],
                is_default=mid == default_id,
            )
        )

    if s.anthropic_api_key and "anthropic" in s.coach_provider_chain_list:
        mid = s.anthropic_coach_model
        options.append(
            CoachModelOption(
                id=mid,
                label=_label_for(mid),
                provider="anthropic",
                provider_label=_PROVIDER_LABELS["anthropic"],
                is_default=mid == default_id,
            )
        )

    if s.resolved_gemini_api_key and "gemini" in s.coach_provider_chain_list:
        mid = s.gemini_coach_model
        options.append(
            CoachModelOption(
                id=mid,
                label=_label_for(mid),
                provider="gemini",
                provider_label=_PROVIDER_LABELS["gemini"],
                is_default=mid == default_id,
            )
        )

    return options


def default_coach_model_id(settings: Settings | None = None) -> str:
    s = settings or get_settings()
    for name in s.coach_provider_chain_list:
        if name == "openai" and s.openai_api_key:
            return s.openai_chat_model
        if name == "anthropic" and s.anthropic_api_key:
            return s.anthropic_coach_model
        if name == "gemini" and s.resolved_gemini_api_key:
            return s.gemini_coach_model
    return s.openai_chat_model


def provider_for_model(model_id: str, settings: Settings | None = None) -> str:
    s = settings or get_settings()
    for m in available_coach_models(s):
        if m.id == model_id:
            return m.provider
    raise ValueError(f"Unknown coach model: {model_id}")


def validate_coach_model(model_id: str | None, settings: Settings | None = None) -> str | None:
    if not model_id or not model_id.strip():
        return None
    model_id = model_id.strip()
    allowed = {m.id for m in available_coach_models(settings)}
    if model_id not in allowed:
        raise ValueError(
            f"Model '{model_id}' is not available. Choose from: {', '.join(sorted(allowed))}"
        )
    return model_id
