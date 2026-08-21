from __future__ import annotations

import asyncio
import logging
from time import monotonic
from collections.abc import AsyncIterator, Iterator
from typing import Any, Protocol

from app.llm.base import _safe_json
from app.llm.effort import ReasoningEffort

logger = logging.getLogger(__name__)


class CoachCapable(Protocol):
    name: str
    chat_model: str

    def chat_messages(
        self, messages: list[dict[str, Any]], json_mode: bool = False
    ) -> str: ...

    def chat_stream(
        self, messages: list[dict[str, Any]], max_tokens: int = 4096
    ) -> Iterator[str]: ...

    def chat_stream_async(
        self, messages: list[dict[str, Any]], max_tokens: int = 4096
    ) -> AsyncIterator[str]: ...


class CoachFallbackChain:
    """Try providers in order; fall through on error or empty response."""

    name = "coach-fallback"
    _unhealthy_until: dict[tuple[str, str], float] = {}

    def __init__(
        self,
        providers: list[CoachCapable],
        requested_model: str | None = None,
        requested_provider: str | None = None,
        reasoning_effort: ReasoningEffort | None = None,
    ):
        if not providers:
            raise ValueError("CoachFallbackChain requires at least one provider")
        self._providers = providers
        self._last_served: str | None = None
        self._last_model: str | None = None
        self._requested_model = requested_model or providers[0].chat_model
        self._requested_provider = requested_provider or providers[0].name
        self._reasoning_effort = reasoning_effort
        self._failures: list[dict[str, str]] = []

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

    @property
    def requested_model(self) -> str:
        return self._requested_model

    @property
    def requested_provider(self) -> str:
        return self._requested_provider

    @property
    def reasoning_effort(self) -> ReasoningEffort | None:
        return self._reasoning_effort

    @property
    def fallback_used(self) -> bool:
        return bool(
            self._last_served
            and (
                self._last_served != self._requested_provider
                or self._last_model != self._requested_model
            )
        )

    @property
    def fallback_reason(self) -> str | None:
        if not self.fallback_used:
            return None
        return f"{self._requested_model} was unavailable"

    @property
    def failures(self) -> list[dict[str, str]]:
        return list(self._failures)

    def reset(self) -> None:
        self._last_served = None
        self._last_model = None
        self._failures = []

    def _record_failure(self, provider: CoachCapable, exc: Exception | None = None) -> None:
        self._failures.append(
            {
                "provider": provider.name,
                "model": provider.chat_model,
                "error": type(exc).__name__ if exc else "EmptyResponse",
            }
        )
        self._mark_temporarily_unhealthy(provider, exc)

    @classmethod
    def _provider_key(cls, provider: CoachCapable) -> tuple[str, str]:
        return provider.name, provider.chat_model

    @classmethod
    def _is_temporarily_unhealthy(cls, provider: CoachCapable) -> bool:
        key = cls._provider_key(provider)
        provider_key = (provider.name, "*")
        until = max(
            cls._unhealthy_until.get(key, 0),
            cls._unhealthy_until.get(provider_key, 0),
        )
        if until <= monotonic():
            cls._unhealthy_until.pop(key, None)
            cls._unhealthy_until.pop(provider_key, None)
            return False
        return True

    @classmethod
    def _mark_temporarily_unhealthy(
        cls, provider: CoachCapable, exc: Exception | None
    ) -> None:
        status = getattr(exc, "status_code", None)
        response = getattr(exc, "response", None)
        status = status or getattr(response, "status_code", None)
        provider_wide = status in {401, 403, 429}
        if status in {401, 403}:
            cooldown = 15 * 60
        elif status == 429:
            cooldown = 60
        elif isinstance(exc, (TimeoutError, asyncio.TimeoutError)):
            # A slow first token is not proof that the provider is unhealthy.
            # Marking it unhealthy made an immediate user retry skip every
            # configured model and fail without making an upstream request.
            return
        elif status and status >= 500:
            cooldown = 30
        else:
            return
        key = (provider.name, "*") if provider_wide else cls._provider_key(provider)
        cls._unhealthy_until[key] = monotonic() + cooldown

    def _mark_served(self, provider: CoachCapable) -> None:
        self._last_served = provider.name
        self._last_model = provider.chat_model

    def chain_summary(self) -> list[dict[str, str]]:
        return [{"provider": p.name, "model": p.chat_model} for p in self._providers]

    def chat_json(self, system: str, user: str) -> dict:
        """Structured JSON completion with provider fallback."""
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
        raw = self.chat_messages(messages, json_mode=True)
        return _safe_json(raw)

    def chat_messages(
        self,
        messages: list[dict[str, Any]],
        json_mode: bool = False,
        max_tokens: int = 4096,
    ) -> str:
        last_err: Exception | None = None
        for provider in self._providers:
            label = f"{provider.name}/{provider.chat_model}"
            if self._is_temporarily_unhealthy(provider):
                logger.warning("Coach skipping temporarily unhealthy %s", label)
                continue
            try:
                out = provider.chat_messages(
                    messages, json_mode=json_mode, max_tokens=max_tokens
                ).strip()
                if out:
                    self._mark_served(provider)
                    logger.info("Coach reply served by %s", label)
                    return out
                logger.warning("Coach empty response from %s — trying next", label)
                self._record_failure(provider)
            except Exception as exc:
                last_err = exc
                self._record_failure(provider, exc)
                logger.warning("Coach failed on %s: %s — trying next", label, exc)
        if last_err:
            raise last_err
        raise RuntimeError("All coach providers returned empty responses")

    def chat_stream(
        self, messages: list[dict[str, Any]], max_tokens: int = 4096
    ) -> Iterator[str]:
        last_err: Exception | None = None
        for provider in self._providers:
            label = f"{provider.name}/{provider.chat_model}"
            if self._is_temporarily_unhealthy(provider):
                logger.warning("Coach skipping temporarily unhealthy %s", label)
                continue
            try:
                got = False
                for token in provider.chat_stream(messages, max_tokens=max_tokens):
                    got = True
                    if not self._last_served:
                        self._mark_served(provider)
                        logger.info("Coach stream started on %s", label)
                    yield token
                if got:
                    return
                logger.warning("Coach empty stream from %s — trying next", label)
                self._record_failure(provider)
            except Exception as exc:
                if self._last_served == provider.name:
                    raise
                last_err = exc
                self._last_served = None
                self._last_model = None
                self._record_failure(provider, exc)
                logger.warning("Coach stream failed on %s: %s — trying next", label, exc)
        if last_err:
            raise last_err
        raise RuntimeError("All coach providers returned empty streams")

    async def chat_stream_async(
        self,
        messages: list[dict[str, Any]],
        max_tokens: int = 4096,
        first_token_timeout: float | None = None,
    ) -> AsyncIterator[str]:
        last_err: Exception | None = None
        for provider in self._providers:
            label = f"{provider.name}/{provider.chat_model}"
            if self._is_temporarily_unhealthy(provider):
                logger.warning("Coach skipping temporarily unhealthy %s", label)
                continue
            try:
                got = False
                stream = provider.chat_stream_async(messages, max_tokens=max_tokens)
                if first_token_timeout:
                    async with asyncio.timeout(first_token_timeout):
                        first_token = await anext(stream)
                    got = True
                    self._mark_served(provider)
                    logger.info("Coach stream started on %s", label)
                    yield first_token
                async for token in stream:
                    got = True
                    if not self._last_served:
                        self._mark_served(provider)
                        logger.info("Coach stream started on %s", label)
                    yield token
                if got:
                    return
                logger.warning("Coach empty stream from %s — trying next", label)
                self._record_failure(provider)
            except (StopAsyncIteration, TimeoutError) as exc:
                last_err = exc
                self._last_served = None
                self._last_model = None
                self._record_failure(provider, exc)
                logger.warning(
                    "Coach produced no first token on %s within %ss — trying next",
                    label,
                    first_token_timeout,
                )
            except Exception as exc:
                if self._last_served == provider.name:
                    raise
                last_err = exc
                self._last_served = None
                self._last_model = None
                self._record_failure(provider, exc)
                logger.warning("Coach stream failed on %s: %s — trying next", label, exc)
        if isinstance(last_err, (TimeoutError, asyncio.TimeoutError)):
            raise RuntimeError(
                "The configured coach models did not start responding in time. "
                "Please retry the message."
            ) from last_err
        if last_err:
            raise last_err
        raise RuntimeError("All coach providers returned empty streams")
