from __future__ import annotations

import io
import logging
import re
from typing import Any

from app.config import get_settings

logger = logging.getLogger(__name__)

FILLER_WORDS = (
    "um",
    "uh",
    "er",
    "ah",
    "like",
    "you know",
    "sort of",
    "kind of",
    "basically",
    "actually",
    "literally",
    "i mean",
)

MIN_AUDIO_BYTES = 100


def _extension_for_mime(mime: str) -> str:
    if "mp4" in mime or "aac" in mime:
        return "m4a"
    if "ogg" in mime:
        return "ogg"
    if "mpeg" in mime or "mp3" in mime:
        return "mp3"
    return "webm"


def analyze_delivery(
    text: str,
    duration_seconds: float,
    segments: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Simple fluency metrics from transcript + optional Whisper segments."""
    lowered = text.lower()
    words = [w for w in re.split(r"\s+", lowered.strip()) if w]
    total_words = len(words)

    filler_counts: dict[str, int] = {}
    total_fillers = 0
    for filler in FILLER_WORDS:
        pattern = r"\b" + re.escape(filler) + r"\b"
        matches = re.findall(pattern, lowered)
        if matches:
            filler_counts[filler] = len(matches)
            total_fillers += len(matches)

    duration = max(duration_seconds, 0.1)
    wpm = round((total_words / duration) * 60) if total_words else 0
    filler_rate = round((total_fillers / total_words) * 100) if total_words else 0

    pauses: list[dict[str, Any]] = []
    if segments and len(segments) >= 2:
        for i in range(1, len(segments)):
            gap = float(segments[i].get("start", 0)) - float(segments[i - 1].get("end", 0))
            if gap >= 0.35:
                after = (segments[i - 1].get("text") or "").strip().split()
                pauses.append(
                    {
                        "duration_ms": round(gap * 1000),
                        "after_word": after[-1] if after else "",
                        "type": "long" if gap >= 1.5 else "breath" if gap >= 0.7 else "hesitation",
                    }
                )

    observations: list[str] = []
    if wpm and wpm < 100:
        observations.append("Pace is a bit slow — aim for a natural conversational flow.")
    elif wpm > 180:
        observations.append("Pace is quite fast — slow down slightly for clarity.")
    if filler_rate > 10:
        observations.append(
            f"High filler usage ({filler_rate} per 100 words) — pause silently instead."
        )
    long_pauses = [p for p in pauses if p["duration_ms"] >= 1500]
    if long_pauses:
        worst = max(long_pauses, key=lambda p: p["duration_ms"])
        observations.append(
            f"Long pause ({worst['duration_ms'] / 1000:.1f}s) after "
            f"\"{worst.get('after_word', '…')}\" — plan your next point while listening."
        )

    return {
        "words_per_minute": wpm,
        "word_count": total_words,
        "filler_count": total_fillers,
        "filler_rate_per_100": filler_rate,
        "filler_breakdown": filler_counts,
        "pause_count": len(pauses),
        "longest_pause_ms": max((p["duration_ms"] for p in pauses), default=0),
        "pauses": pauses[:5],
        "duration_seconds": round(duration, 1),
        "observations": observations,
    }


def transcribe_audio(
    audio_bytes: bytes,
    mime_type: str,
    duration_hint: float | None = None,
) -> dict[str, Any]:
    settings = get_settings()
    if not settings.openai_api_key:
        raise ValueError("Speech transcription is not configured on the server.")

    if len(audio_bytes) < MIN_AUDIO_BYTES:
        raise ValueError(
            "Recording too short or empty. Please speak clearly and try again."
        )

    from openai import OpenAI

    client = OpenAI(api_key=settings.openai_api_key)
    ext = _extension_for_mime(mime_type or "audio/webm")
    safe_mime = mime_type if mime_type.startswith("audio/") else "audio/webm"
    file_obj = io.BytesIO(audio_bytes)
    file_obj.name = f"recording.{ext}"

    try:
        result = client.audio.transcriptions.create(
            file=(file_obj.name, file_obj, safe_mime),
            model="whisper-1",
            language="en",
            response_format="verbose_json",
            temperature=0,
        )
    except Exception as e:
        logger.warning("Whisper transcription failed: %s", e)
        raise ValueError(
            "Could not transcribe your speech. Check your microphone and try again."
        ) from e

    text = (getattr(result, "text", None) or "").strip()
    if not text:
        raise ValueError(
            "No speech detected. Please speak clearly and record again."
        )

    raw_segments = getattr(result, "segments", None) or []
    segments = [
        {"start": s.start, "end": s.end, "text": (s.text or "").strip()}
        for s in raw_segments
        if getattr(s, "text", None)
    ]
    duration = (
        getattr(result, "duration", None)
        or (segments[-1]["end"] if segments else 0)
        or duration_hint
        or 0
    )

    delivery = analyze_delivery(text, float(duration), segments)
    return {
        "text": text,
        "duration_seconds": round(float(duration), 1),
        "segments": segments,
        "delivery": delivery,
        "model": "whisper-1",
    }
