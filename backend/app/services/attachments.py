from __future__ import annotations

import base64
import mimetypes
from dataclasses import dataclass
from typing import Any

from app.services.text_extract import extract_text

MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024  # 5 MB per file
MAX_ATTACHMENTS = 5

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
DOC_EXTENSIONS = {".pdf", ".txt", ".md", ".docx", ".doc"}


@dataclass
class ProcessedAttachment:
    name: str
    kind: str  # "image" | "document"
    meta: dict[str, str]
    content_parts: list[dict[str, Any]]


def _ext(name: str) -> str:
    dot = name.rfind(".")
    return name[dot:].lower() if dot >= 0 else ""


def process_attachment(filename: str, data: bytes) -> ProcessedAttachment:
    if len(data) > MAX_ATTACHMENT_BYTES:
        raise ValueError(f"{filename} exceeds the 5 MB limit.")

    ext = _ext(filename)
    if ext in IMAGE_EXTENSIONS:
        mime = mimetypes.guess_type(filename)[0] or "image/png"
        b64 = base64.standard_b64encode(data).decode("ascii")
        return ProcessedAttachment(
            name=filename,
            kind="image",
            meta={"name": filename, "kind": "image", "mime": mime},
            content_parts=[
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{mime};base64,{b64}"},
                }
            ],
        )

    if ext in DOC_EXTENSIONS:
        text = extract_text(filename, data).strip()
        if not text:
            raise ValueError(f"Could not extract text from {filename}.")
        snippet = text[:12_000]
        return ProcessedAttachment(
            name=filename,
            kind="document",
            meta={"name": filename, "kind": "document"},
            content_parts=[
                {
                    "type": "text",
                    "text": f"[Attached document: {filename}]\n{snippet}",
                }
            ],
        )

    raise ValueError(
        f"Unsupported file type for {filename}. Use images (PNG, JPG, …) or documents (PDF, TXT, DOCX)."
    )


def build_user_content(
    message: str, attachments: list[ProcessedAttachment]
) -> str | list[dict[str, Any]]:
    """OpenAI message content — plain string or multimodal parts array."""
    parts: list[dict[str, Any]] = []
    for att in attachments:
        parts.extend(att.content_parts)
    if message.strip():
        parts.append({"type": "text", "text": message.strip()})
    if not parts:
        return message
    if len(parts) == 1 and parts[0]["type"] == "text":
        return parts[0]["text"]
    return parts
