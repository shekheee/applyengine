from __future__ import annotations

import base64
import re
from typing import Any

_DATA_URL_RE = re.compile(r"^data:([^;]+);base64,(.+)$", re.DOTALL)


def split_system(messages: list[dict[str, Any]]) -> tuple[str, list[dict[str, Any]]]:
    """Extract system prompt and return remaining user/assistant turns."""
    system = ""
    rest: list[dict[str, Any]] = []
    for msg in messages:
        if msg.get("role") == "system":
            system = str(msg.get("content", ""))
        else:
            rest.append(msg)
    return system, rest


def _openai_part_to_anthropic(part: dict[str, Any]) -> dict[str, Any] | None:
    if part.get("type") == "text":
        return {"type": "text", "text": part.get("text", "")}
    if part.get("type") == "image_url":
        url = part.get("image_url", {}).get("url", "")
        m = _DATA_URL_RE.match(url)
        if m:
            return {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": m.group(1),
                    "data": m.group(2),
                },
            }
    return None


def _openai_part_to_gemini(part: dict[str, Any]) -> dict[str, Any] | None:
    if part.get("type") == "text":
        return {"text": part.get("text", "")}
    if part.get("type") == "image_url":
        url = part.get("image_url", {}).get("url", "")
        m = _DATA_URL_RE.match(url)
        if m:
            return {
                "inline_data": {
                    "mime_type": m.group(1),
                    "data": m.group(2),
                }
            }
    return None


def _content_to_anthropic(content: Any) -> str | list[dict[str, Any]]:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        blocks: list[dict[str, Any]] = []
        for part in content:
            if not isinstance(part, dict):
                continue
            block = _openai_part_to_anthropic(part)
            if block:
                blocks.append(block)
        return blocks or ""
    return str(content)


def _content_to_gemini(content: Any) -> list[dict[str, Any]]:
    if isinstance(content, str):
        return [{"text": content}] if content else []
    if isinstance(content, list):
        parts: list[dict[str, Any]] = []
        for part in content:
            if not isinstance(part, dict):
                continue
            gp = _openai_part_to_gemini(part)
            if gp:
                parts.append(gp)
        return parts
    return [{"text": str(content)}]


def to_anthropic(messages: list[dict[str, Any]]) -> tuple[str, list[dict[str, Any]]]:
    system, rest = split_system(messages)
    out: list[dict[str, Any]] = []
    for msg in rest:
        role = "assistant" if msg.get("role") == "assistant" else "user"
        out.append({"role": role, "content": _content_to_anthropic(msg.get("content", ""))})
    return system, out


def to_gemini(messages: list[dict[str, Any]]) -> tuple[str, list[dict[str, Any]]]:
    system, rest = split_system(messages)
    contents: list[dict[str, Any]] = []
    for msg in rest:
        role = "model" if msg.get("role") == "assistant" else "user"
        parts = _content_to_gemini(msg.get("content", ""))
        if parts:
            contents.append({"role": role, "parts": parts})
    return system, contents
