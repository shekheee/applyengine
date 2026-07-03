from __future__ import annotations

from app.llm.base import LLMProvider


class OpenAIProvider(LLMProvider):
    name = "openai"

    def __init__(self, api_key: str, chat_model: str, embed_model: str):
        from openai import OpenAI

        self._client = OpenAI(api_key=api_key)
        self._chat_model = chat_model
        self._embed_model = embed_model

    def chat(self, system: str, user: str, json_mode: bool = False) -> str:
        kwargs: dict = {
            "model": self._chat_model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.3,
        }
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        resp = self._client.chat.completions.create(**kwargs)
        return resp.choices[0].message.content or ""

    def embed(self, texts: list[str]) -> list[list[float]]:
        resp = self._client.embeddings.create(model=self._embed_model, input=texts)
        return [d.embedding for d in resp.data]
