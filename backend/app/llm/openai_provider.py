from __future__ import annotations

from collections.abc import AsyncIterator, Iterator
from typing import Any

from app.llm.base import LLMProvider


def _is_gpt5_family(model: str) -> bool:
    m = model.lower()
    return m.startswith("gpt-5") or m.startswith("o3") or m.startswith("o4")


def _completion_kwargs(model: str, **extra: Any) -> dict[str, Any]:
    """Build chat.completions kwargs, adapting for GPT-5 / reasoning models."""
    kwargs: dict[str, Any] = {"model": model, **extra}
    if _is_gpt5_family(model):
        kwargs.pop("temperature", None)
        if "max_tokens" in kwargs:
            kwargs["max_completion_tokens"] = kwargs.pop("max_tokens")
    elif "temperature" not in kwargs:
        kwargs["temperature"] = 0.3
    return kwargs


class OpenAIProvider(LLMProvider):
    name = "openai"

    def __init__(self, api_key: str, chat_model: str, embed_model: str):
        from openai import AsyncOpenAI, OpenAI

        self._client = OpenAI(api_key=api_key)
        self._async_client = AsyncOpenAI(api_key=api_key)
        self._chat_model = chat_model
        self._embed_model = embed_model

    @property
    def chat_model(self) -> str:
        return self._chat_model

    def chat(self, system: str, user: str, json_mode: bool = False) -> str:
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
        return self.chat_messages(messages, json_mode=json_mode)

    def chat_messages(
        self,
        messages: list[dict[str, Any]],
        json_mode: bool = False,
        max_tokens: int = 4096,
    ) -> str:
        kwargs = _completion_kwargs(
            self._chat_model,
            messages=messages,
        )
        if _is_gpt5_family(self._chat_model):
            kwargs["max_completion_tokens"] = max_tokens
        else:
            kwargs["max_tokens"] = max_tokens
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        resp = self._client.chat.completions.create(**kwargs)
        return resp.choices[0].message.content or ""

    def chat_stream(
        self, messages: list[dict[str, Any]]
    ) -> Iterator[str]:
        kwargs = _completion_kwargs(
            self._chat_model,
            messages=messages,
            stream=True,
            max_completion_tokens=4096 if _is_gpt5_family(self._chat_model) else None,
        )
        if kwargs.get("max_completion_tokens") is None:
            kwargs.pop("max_completion_tokens", None)
        stream = self._client.chat.completions.create(**kwargs)
        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    async def chat_stream_async(
        self, messages: list[dict[str, Any]]
    ) -> AsyncIterator[str]:
        kwargs = _completion_kwargs(
            self._chat_model,
            messages=messages,
            stream=True,
            max_completion_tokens=4096 if _is_gpt5_family(self._chat_model) else None,
        )
        if kwargs.get("max_completion_tokens") is None:
            kwargs.pop("max_completion_tokens", None)
        stream = await self._async_client.chat.completions.create(**kwargs)
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    def embed(self, texts: list[str]) -> list[list[float]]:
        resp = self._client.embeddings.create(model=self._embed_model, input=texts)
        return [d.embedding for d in resp.data]
