from __future__ import annotations

import hashlib
import json
import math
import re
from abc import ABC, abstractmethod


class LLMProvider(ABC):
    """Common interface every LLM backend implements.

    Keeping this narrow (chat + embed) means services never care which
    vendor is configured, and swapping providers is a one-line env change.
    """

    name: str = "base"

    @abstractmethod
    def chat(self, system: str, user: str, json_mode: bool = False) -> str:
        """Return a single completion for the given system + user prompt."""

    @abstractmethod
    def embed(self, texts: list[str]) -> list[list[float]]:
        """Return an embedding vector per input text."""

    def chat_json(self, system: str, user: str) -> dict:
        """Chat call that must return a JSON object. Falls back gracefully."""
        raw = self.chat(system, user, json_mode=True)
        return _safe_json(raw)


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

_TOKEN_RE = re.compile(r"[a-z0-9+#.]+")
_LOCAL_EMBED_DIM = 512


def tokenize(text: str) -> list[str]:
    return _TOKEN_RE.findall(text.lower())


def local_embed(texts: list[str]) -> list[list[float]]:
    """Deterministic hashing embedding so the app works with zero API keys.

    Not semantically rich, but stable and dependency-free — good enough for
    keyword-overlap style matching and for offline demos / CI.
    """
    vectors: list[list[float]] = []
    for text in texts:
        vec = [0.0] * _LOCAL_EMBED_DIM
        for tok in tokenize(text):
            h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
            vec[h % _LOCAL_EMBED_DIM] += 1.0
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        vectors.append([v / norm for v in vec])
    return vectors


def _safe_json(raw: str) -> dict:
    raw = raw.strip()
    # Strip markdown code fences if a model wrapped the JSON.
    if raw.startswith("```"):
        raw = re.sub(r"^```[a-zA-Z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Best effort: grab the outermost {...} block.
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass
    return {}
