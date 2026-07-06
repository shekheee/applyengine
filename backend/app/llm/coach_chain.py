from __future__ import annotations

import logging
from collections.abc import AsyncIterator, Iterator
from typing import Any, Protocol

logger = logging.getLogger(__name__)


class CoachCapable(Protocol):
    name: str
    chat_model: str

    def chat_messages(
        self, messages: list[dict[str, Any]], json_mode: bool = False
    ) -> str: ...

    def chat_stream(self, messages: list[dict[str, Any]]) -> Iterator[str]: ...

    def chat_stream_async(
        self, messages: list[dict[str, Any]]
    ) -> AsyncIterator[str]: ...


class CoachFallbackChain:
    """Try providers in order; fall through on error or empty response."""

    name = "coach-fallback"

    def __init__(self, providers: list[CoachCapable]):
        if not providers:
            raise ValueError("CoachFallbackChain requires at least one provider")
        self._providers = providers
        self._last_served: str | None = None
        self._last_model: str | None = None

    @property
    def chat_model(self) -> str:
        if self._last_model:
            return self._last_model
        for p in self._providers:
            if p.name == (self._last_served or ""):
                return p.chat_model
        return self._providers[0].chat_model

    @property
    def last_served(self) -> str | None:
        return self._last_served

    @property
    def last_model(self) -> str | None:
        return self._last_model

    def reset(self) -> None:
        self._last_served = None
        self._last_model = None

    def _mark_served(self, provider: CoachCapable) -> None:
        self._last_served = provider.name
        self._last_model = provider.chat_model

    def chain_summary(self) -> list[dict[str, str]]:
        return [{"provider": p.name, "model": p.chat_model} for p in self._providers]

    def chat_messages(
        self, messages: list[dict[str, Any]], json_mode: bool = False
    ) -> str:
        last_err: Exception | None = None
        for provider in self._providers:
            label = f"{provider.name}/{provider.chat_model}"
            try:
                out = provider.chat_messages(messages, json_mode=json_mode).strip()
                if out:
                    self._mark_served(provider)
                    logger.info("Coach reply served by %s", label)
                    return out
                logger.warning("Coach empty response from %s — trying next", label)
            except Exception as exc:
                last_err = exc
                logger.warning("Coach failed on %s: %s — trying next", label, exc)
        if last_err:
            raise last_err
        raise RuntimeError("All coach providers returned empty responses")

    def chat_stream(self, messages: list[dict[str, Any]]) -> Iterator[str]:
        last_err: Exception | None = None
        for provider in self._providers:
            label = f"{provider.name}/{provider.chat_model}"
            try:
                got = False
                for token in provider.chat_stream(messages):
                    got = True
                    if not self._last_served:
                        self._mark_served(provider)
                        logger.info("Coach stream started on %s", label)
                    yield token
                if got:
                    return
                logger.warning("Coach empty stream from %s — trying next", label)
            except Exception as exc:
                if self._last_served == provider.name:
                    raise
                last_err = exc
                self.reset()
                logger.warning("Coach stream failed on %s: %s — trying next", label, exc)
        if last_err:
            raise last_err
        raise RuntimeError("All coach providers returned empty streams")

    async def chat_stream_async(
        self, messages: list[dict[str, Any]]
    ) -> AsyncIterator[str]:
        last_err: Exception | None = None
        for provider in self._providers:
            label = f"{provider.name}/{provider.chat_model}"
            try:
                got = False
                async for token in provider.chat_stream_async(messages):
                    got = True
                    if not self._last_served:
                        self._mark_served(provider)
                        logger.info("Coach stream started on %s", label)
                    yield token
                if got:
                    return
                logger.warning("Coach empty stream from %s — trying next", label)
            except Exception as exc:
                if self._last_served == provider.name:
                    raise
                last_err = exc
                self.reset()
                logger.warning("Coach stream failed on %s: %s — trying next", label, exc)
        if last_err:
            raise last_err
        raise RuntimeError("All coach providers returned empty streams")
