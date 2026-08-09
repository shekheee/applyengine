from __future__ import annotations

from app.llm.base import LLMProvider
from app.llm.coach_chain import CoachFallbackChain
from app.llm.embedding_chain import EmbeddingFallbackChain


class ResilientLLMProvider(LLMProvider):
    """Route legacy generation and embedding calls through backup chains."""

    name = "resilient"

    def __init__(
        self,
        chat_chain: CoachFallbackChain,
        embedding_chain: EmbeddingFallbackChain,
    ):
        self.chat_chain = chat_chain
        self.embedding_chain = embedding_chain

    def chat(self, system: str, user: str, json_mode: bool = False) -> str:
        return self.chat_chain.chat_messages(
            [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            json_mode=json_mode,
        )

    def embed(self, texts: list[str]) -> list[list[float]]:
        return self.embedding_chain.embed(texts)
