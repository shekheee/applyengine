from __future__ import annotations

import logging
from typing import Protocol

from app.llm.base import local_embed

logger = logging.getLogger(__name__)


class EmbeddingCapable(Protocol):
    name: str

    def embed(self, texts: list[str]) -> list[list[float]]: ...


class LocalEmbeddingProvider:
    name = "local"
    embedding_model = "local-hashing-512"

    def embed(self, texts: list[str]) -> list[list[float]]:
        return local_embed(texts)


class EmbeddingFallbackChain:
    """Try configured embeddings, then use the private local fallback."""

    def __init__(self, providers: list[EmbeddingCapable]):
        self._providers = [*providers, LocalEmbeddingProvider()]
        self.last_served: str | None = None
        self.last_model: str | None = None
        self.failures: list[dict[str, str]] = []

    @staticmethod
    def _model(provider: EmbeddingCapable) -> str:
        return str(
            getattr(provider, "embedding_model", None)
            or getattr(provider, "_embed_model", None)
            or "embedding"
        )

    @property
    def fallback_used(self) -> bool:
        return bool(self.last_served and self.last_served != self._providers[0].name)

    def embed(self, texts: list[str]) -> list[list[float]]:
        self.last_served = None
        self.last_model = None
        self.failures = []
        for provider in self._providers:
            model = self._model(provider)
            try:
                vectors = provider.embed(texts)
                if len(vectors) != len(texts) or any(not vector for vector in vectors):
                    raise RuntimeError("empty or incomplete embedding response")
                self.last_served = provider.name
                self.last_model = model
                logger.info("Embeddings served by %s/%s", provider.name, model)
                return vectors
            except Exception as exc:
                self.failures.append(
                    {"provider": provider.name, "model": model, "error": type(exc).__name__}
                )
                logger.warning(
                    "Embedding provider %s/%s failed (%s); using backup",
                    provider.name,
                    model,
                    type(exc).__name__,
                )
        raise RuntimeError("All embedding providers failed")
