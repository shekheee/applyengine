from __future__ import annotations

from app.llm.base import LLMProvider, local_embed


class MockProvider(LLMProvider):
    """No-network provider used when no API key is configured.

    It intentionally returns empty completions: every service has a
    deterministic heuristic fallback, so the whole app (and the eval suite)
    runs end-to-end offline. Real providers then *improve* on the heuristics.
    """

    name = "mock"

    def chat(self, system: str, user: str, json_mode: bool = False) -> str:
        return ""

    def embed(self, texts: list[str]) -> list[list[float]]:
        return local_embed(texts)
