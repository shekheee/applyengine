from __future__ import annotations

import hashlib
import json
import re
from typing import Any


def _normalized_text(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


def _normalized_value(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            _normalized_text(key): _normalized_value(item)
            for key, item in sorted(value.items())
            if item not in (None, "", [], {})
        }
    if isinstance(value, list):
        return [_normalized_value(item) for item in value]
    return _normalized_text(value)


def _content_fingerprint(entry: dict[str, Any]) -> str:
    canonical = json.dumps(
        _normalized_value(entry), sort_keys=True, separators=(",", ":")
    )
    return hashlib.sha256(canonical.encode()).hexdigest()


def _entry_key(entry: dict[str, Any], kind: str) -> tuple[str, ...]:
    title_fields = ("name", "title") if kind == "projects" else ("title", "role")
    title = next(
        (_normalized_text(entry.get(field)) for field in title_fields if entry.get(field)),
        "",
    )
    organization = _normalized_text(
        entry.get("organization") or entry.get("company")
    )
    dates = _normalized_text(
        entry.get("dates")
        or entry.get("date")
        or entry.get("duration")
        or entry.get("period")
    )

    # A title alone is not a safe identity: two distinct projects can share a name.
    if title and (organization or dates):
        return ("identity", title, organization, dates)
    return ("fingerprint", _content_fingerprint(entry))


def _richness(value: Any) -> int:
    if isinstance(value, dict):
        return sum(_richness(item) for item in value.values())
    if isinstance(value, list):
        return sum(_richness(item) for item in value)
    return len(str(value or "").strip())


def _merge_duplicate(
    current: dict[str, Any], candidate: dict[str, Any]
) -> dict[str, Any]:
    richer, other = (
        (candidate, current)
        if _richness(candidate) > _richness(current)
        else (current, candidate)
    )
    merged = dict(richer)
    for key, value in other.items():
        if key not in merged or merged[key] in (None, "", [], {}):
            merged[key] = value
        elif isinstance(merged[key], list) and isinstance(value, list):
            seen = {
                json.dumps(_normalized_value(item), sort_keys=True)
                for item in merged[key]
            }
            for item in value:
                marker = json.dumps(_normalized_value(item), sort_keys=True)
                if marker not in seen:
                    merged[key].append(item)
                    seen.add(marker)
    return merged


def deduplicate_entries(entries: Any, kind: str) -> list[dict[str, Any]]:
    """Remove exact/identity duplicates while preserving order and richer data."""
    if not isinstance(entries, list):
        return []
    output: list[dict[str, Any]] = []
    positions: dict[tuple[str, ...], int] = {}
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        key = _entry_key(entry, kind)
        if key in positions:
            index = positions[key]
            output[index] = _merge_duplicate(output[index], entry)
        else:
            positions[key] = len(output)
            output.append(dict(entry))
    return output


def normalize_resume_data(data: dict[str, Any]) -> dict[str, Any]:
    """Normalize structured resume lists at every ingestion boundary."""
    normalized = dict(data)
    normalized["experience"] = deduplicate_entries(
        normalized.get("experience"), "experience"
    )
    normalized["projects"] = deduplicate_entries(
        normalized.get("projects"), "projects"
    )
    return normalized
