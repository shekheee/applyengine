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
    openai_chat_model: str = "gpt-5.5"
    openai_embed_model: str = "text-embedding-3-small"

    # Anthropic
    anthropic_api_key: str | None = None
    anthropic_chat_model: str = "claude-3-5-sonnet-latest"
    anthropic_coach_model: str = "claude-opus-4-8"

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

    # Coach fallback order: comma-separated provider names
    coach_provider_chain: str = "openai,anthropic,gemini"

    # App
    database_url: str = "sqlite:///./applyengine.db"
    cors_origins: str = "http://localhost:3000"

    # Auth
    jwt_secret: str = "dev-insecure-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 14  # 14 days
    signup_code: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def coach_provider_chain_list(self) -> list[str]:
        return [p.strip().lower() for p in self.coach_provider_chain.split(",") if p.strip()]

    @property
    def resolved_gemini_api_key(self) -> str | None:
        return self.gemini_api_key


@lru_cache
def get_settings() -> Settings:
    return Settings()
