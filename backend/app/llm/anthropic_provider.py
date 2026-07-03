from __future__ import annotations

from app.llm.base import LLMProvider, local_embed


class AnthropicProvider(LLMProvider):
    """Claude for chat. Anthropic has no embeddings API, so embeddings fall
    back to OpenAI when a key is present, otherwise the local hashing embedder.
    """

    name = "anthropic"

    def __init__(
        self,
        api_key: str,
        chat_model: str,
        openai_api_key: str | None = None,
        openai_embed_model: str = "text-embedding-3-small",
    ):
        from anthropic import Anthropic

        self._client = Anthropic(api_key=api_key)
        self._chat_model = chat_model
        self._openai_embed = None
        if openai_api_key:
            from app.llm.openai_provider import OpenAIProvider

            self._openai_embed = OpenAIProvider(
                openai_api_key, chat_model="gpt-4o-mini", embed_model=openai_embed_model
            )

    def chat(self, system: str, user: str, json_mode: bool = False) -> str:
        if json_mode:
            system = f"{system}\n\nRespond with a single valid JSON object and nothing else."
        resp = self._client.messages.create(
            model=self._chat_model,
            max_tokens=2048,
            temperature=0.3,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return "".join(block.text for block in resp.content if block.type == "text")

    def embed(self, texts: list[str]) -> list[list[float]]:
        if self._openai_embed is not None:
            return self._openai_embed.embed(texts)
        return local_embed(texts)
