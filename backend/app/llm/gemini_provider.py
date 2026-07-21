from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator, Iterator
from typing import Any

import httpx

from app.llm.base import LLMProvider, local_embed
from app.llm.messages import to_gemini

logger = logging.getLogger(__name__)

_GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"


class GeminiProvider(LLMProvider):
    """Google Gemini via the Generative Language REST API."""

    name = "gemini"

    def __init__(self, api_key: str, chat_model: str):
        self._api_key = api_key
        self._chat_model = chat_model
        self._client = httpx.Client(timeout=120.0)
        self._async_client = httpx.AsyncClient(timeout=120.0)

    @property
    def chat_model(self) -> str:
        return self._chat_model

    def _payload(self, messages: list[dict[str, Any]]) -> dict[str, Any]:
        system, contents = to_gemini(messages)
        body: dict[str, Any] = {"contents": contents}
        if system:
            body["systemInstruction"] = {"parts": [{"text": system}]}
        return body

    def _extract_text(self, data: dict[str, Any]) -> str:
        if "error" in data:
            raise RuntimeError(data["error"].get("message", "Gemini API error"))
        parts = (
            data.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [])
        )
        return "".join(p.get("text", "") for p in parts if isinstance(p, dict))

    def chat(self, system: str, user: str, json_mode: bool = False) -> str:
        return self.chat_messages(
            [{"role": "system", "content": system}, {"role": "user", "content": user}],
            json_mode=json_mode,
        )

    def chat_messages(
        self,
        messages: list[dict[str, Any]],
        json_mode: bool = False,
        max_tokens: int = 4096,
    ) -> str:
        body = self._payload(messages)
        gen_cfg: dict[str, Any] = {"maxOutputTokens": max_tokens}
        if json_mode:
            gen_cfg["responseMimeType"] = "application/json"
        body["generationConfig"] = gen_cfg
        url = f"{_GEMINI_BASE}/models/{self._chat_model}:generateContent"
        resp = self._client.post(url, params={"key": self._api_key}, json=body)
        resp.raise_for_status()
        return self._extract_text(resp.json())

    def chat_stream(self, messages: list[dict[str, Any]]) -> Iterator[str]:
        body = self._payload(messages)
        url = f"{_GEMINI_BASE}/models/{self._chat_model}:streamGenerateContent"
        with self._client.stream(
            "POST", url, params={"key": self._api_key, "alt": "sse"}, json=body
        ) as resp:
            resp.raise_for_status()
            for line in resp.iter_lines():
                if not line.startswith("data: "):
                    continue
                chunk = json.loads(line[6:])
                text = self._extract_text(chunk)
                if text:
                    yield text

    async def chat_stream_async(
        self, messages: list[dict[str, Any]]
    ) -> AsyncIterator[str]:
        body = self._payload(messages)
        url = f"{_GEMINI_BASE}/models/{self._chat_model}:streamGenerateContent"
        async with self._async_client.stream(
            "POST", url, params={"key": self._api_key, "alt": "sse"}, json=body
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                chunk = json.loads(line[6:])
                text = self._extract_text(chunk)
                if text:
                    yield text

    def embed(self, texts: list[str]) -> list[list[float]]:
        return local_embed(texts)
