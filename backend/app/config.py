from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment / .env file."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # LLM provider selection (non-coach tasks: parsing, generation, etc.)
    llm_provider: str = "mock"  # "openai" | "anthropic" | "mock"

    # OpenAI
    openai_api_key: str | None = None
    openai_chat_model: str = "gpt-5.6-terra"
    openai_coach_models: str = (
        "gpt-5.6-terra,gpt-5.6-sol,gpt-5.5,gpt-5.6-luna"
    )
    openai_embed_model: str = "text-embedding-3-small"
    speech_transcription_models: str = "gpt-4o-mini-transcribe,gpt-4o-transcribe,whisper-1"
    speech_tts_model: str = "tts-1"
    openai_realtime_model: str = "gpt-realtime-2.1-mini"
    openai_realtime_transcription_model: str = "gpt-realtime-whisper"
    openai_realtime_voice: str = "marin"
    openai_realtime_enabled: bool = True

    # Anthropic
    anthropic_api_key: str | None = None
    anthropic_chat_model: str = "claude-3-5-sonnet-latest"
    anthropic_coach_model: str = "claude-opus-4-8"
    anthropic_coach_models: str = (
        "claude-opus-4-8,claude-opus-5,claude-fable-5"
    )

    # Gemini (accepts common env var names)
    gemini_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "GEMINI_API_KEY",
            "GOOGLE_API_KEY",
            "GOOGLE_GENERATIVE_AI_API_KEY",
        ),
    )
    gemini_coach_model: str = "gemini-3.1-pro-preview"
    gemini_coach_models: str = "gemini-3.1-pro-preview"
    gemini_audio_model: str = "gemini-3.1-flash-lite"
    gemini_audio_analysis_enabled: bool = True

    # Coach fallback order. Anthropic is deliberately excluded from the active
    # product path while that account is unavailable.
    coach_provider_chain: str = "openai,gemini"
    coach_default_model: str = "gpt-5.6-terra"

    # Cheap task-specific models keep auxiliary work off the frontier model.
    background_model: str = "gpt-5.6-luna"
    memory_model: str = "gpt-5.6-luna"
    search_provider: str = "openai"
    search_model: str = "gpt-5.6-luna"
    search_timeout_seconds: float = 8.0
    search_cache_ttl_seconds: int = 60 * 60 * 6
    # Reasoning models can legitimately spend more than ten seconds before
    # their first visible token. This is only a first-token ceiling; fast
    # responses are unaffected.
    coach_first_token_timeout_seconds: float = 30.0
    coach_recent_message_limit: int = 10
    coach_relevant_memory_limit: int = 10

    # App
    database_url: str = "sqlite:///./applyengine.db"
    cors_origins: str = (
        "http://localhost:3000,"
        "https://applyengine.ajayshekhawat.uk,"
        "https://www.applyengine.ajayshekhawat.uk,"
        "https://applyengine.vercel.app"
    )

    # Auth
    jwt_secret: str = "dev-insecure-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 14  # 14 days

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def coach_provider_chain_list(self) -> list[str]:
        # Filtering here also protects deployments that still have an older
        # COACH_PROVIDER_CHAIN value such as "anthropic,gemini,openai".
        supported = {"openai", "gemini"}
        return [
            provider
            for raw in self.coach_provider_chain.split(",")
            if (provider := raw.strip().lower()) in supported
        ]

    @staticmethod
    def _model_list(value: str, default: str) -> list[str]:
        models = [model.strip() for model in value.split(",") if model.strip()]
        if default:
            models = [default, *(model for model in models if model != default)]
        return list(dict.fromkeys(models))

    @property
    def openai_coach_model_list(self) -> list[str]:
        models = self._model_list(
            self.openai_coach_models, self.coach_default_model
        )
        for model in (self.openai_chat_model, self.background_model):
            if model and model not in models:
                models.append(model)
        return models

    @property
    def speech_transcription_model_list(self) -> list[str]:
        return self._model_list(self.speech_transcription_models, "")

    @property
    def anthropic_coach_model_list(self) -> list[str]:
        return self._model_list(
            self.anthropic_coach_models, self.anthropic_coach_model
        )

    @property
    def gemini_coach_model_list(self) -> list[str]:
        return self._model_list(self.gemini_coach_models, self.gemini_coach_model)

    @property
    def resolved_gemini_api_key(self) -> str | None:
        return self.gemini_api_key


@lru_cache
def get_settings() -> Settings:
    return Settings()
