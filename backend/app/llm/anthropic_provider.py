from __future__ import annotations

from collections.abc import AsyncIterator, Iterator
from typing import Any

from app.llm.base import LLMProvider, local_embed
from app.llm.messages import to_anthropic


class AnthropicProvider(LLMProvider):
    """Claude for chat with multi-turn + multimodal support."""

    name = "anthropic"

    def __init__(
        self,
        api_key: str,
        chat_model: str,
        openai_api_key: str | None = None,
        openai_embed_model: str = "text-embedding-3-small",
    ):
        from anthropic import Anthropic, AsyncAnthropic

        self._client = Anthropic(api_key=api_key)
        self._async_client = AsyncAnthropic(api_key=api_key)
        self._chat_model = chat_model
        self._openai_embed = None
        if openai_api_key:
            from app.llm.openai_provider import OpenAIProvider

            self._openai_embed = OpenAIProvider(
                openai_api_key, chat_model="gpt-4o-mini", embed_model=openai_embed_model
            )

    @property
    def chat_model(self) -> str:
        return self._chat_model

    def chat(self, system: str, user: str, json_mode: bool = False) -> str:
        if json_mode:
            system = f"{system}\n\nRespond with a single valid JSON object and nothing else."
        return self.chat_messages(
            [{"role": "system", "content": system}, {"role": "user", "content": user}]
        )

    def chat_messages(self, messages: list[dict[str, Any]], json_mode: bool = False) -> str:
        system, api_messages = to_anthropic(messages)
        if json_mode:
            system = f"{system}\n\nRespond with a single valid JSON object and nothing else."
        resp = self._client.messages.create(
            model=self._chat_model,
            max_tokens=4096,
            system=system,
            messages=api_messages,
        )
        return "".join(block.text for block in resp.content if block.type == "text")

    def chat_stream(self, messages: list[dict[str, Any]]) -> Iterator[str]:
        system, api_messages = to_anthropic(messages)
        with self._client.messages.stream(
            model=self._chat_model,
            max_tokens=4096,
            system=system,
            messages=api_messages,
        ) as stream:
            for text in stream.text_stream:
                if text:
                    yield text

    async def chat_stream_async(
        self, messages: list[dict[str, Any]]
    ) -> AsyncIterator[str]:
        system, api_messages = to_anthropic(messages)
        async with self._async_client.messages.stream(
            model=self._chat_model,
            max_tokens=4096,
            system=system,
            messages=api_messages,
        ) as stream:
            async for text in stream.text_stream:
                if text:
                    yield text

    def embed(self, texts: list[str]) -> list[list[float]]:
        if self._openai_embed is not None:
            return self._openai_embed.embed(texts)
        return local_embed(texts)
