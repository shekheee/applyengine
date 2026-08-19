from __future__ import annotations

import re
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from typing import Any

from app.models import InterviewSession, InterviewTurn
from app.services.ml_interview_curriculum import TOPIC_BY_ID, topic_label


def _parse_score(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _session_score(session: InterviewSession) -> float | None:
    if session.overall_score is not None:
        return float(session.overall_score)
    summary = session.summary or {}
    return _parse_score(summary.get("overall_score"))


def _theme_key(text: str) -> str:
    """Cluster wording variants without requiring an embedding provider."""
    stop = {
        "a", "an", "and", "are", "be", "for", "from", "in", "is", "of", "on",
        "the", "to", "use", "with", "your", "you", "more", "improve", "needs", "need",
    }
    words = [
        word for word in re.findall(r"[a-z0-9]+", text.lower())
        if len(word) > 2 and word not in stop
    ]
    return " ".join(sorted(set(words))[:10]) or text.strip().lower()


def _clustered_themes(items: list[str], limit: int) -> list[dict[str, Any]]:
    counts: Counter[str] = Counter()
    representative: dict[str, str] = {}
    for item in items:
        clean = item.strip()
        if not clean:
            continue
        key = _theme_key(clean)
        counts[key] += 1
        representative.setdefault(key, clean)
    return [
        {"text": representative[key], "count": count}
        for key, count in counts.most_common(limit)
    ]


def build_interview_progress(sessions: list[InterviewSession], turns_by_session: dict[int, list[InterviewTurn]] | None = None) -> dict[str, Any]:
    turns_by_session = turns_by_session or {}
    completed = [s for s in sessions if s.status == "completed"]
    scored: list[tuple[InterviewSession, float]] = []
    for s in completed:
        score = _session_score(s)
        if score is not None:
            scored.append((s, score))

    scores = [sc for _, sc in scored]
    avg_score = round(sum(scores) / len(scores), 1) if scores else None
    best_score = max(scores) if scores else None
    worst_score = min(scores) if scores else None

    # Score over time (oldest first for chart)
    score_over_time: list[dict[str, Any]] = []
    for s, sc in sorted(scored, key=lambda x: x[0].created_at or datetime.min.replace(tzinfo=timezone.utc)):
        created = s.created_at
        score_over_time.append(
            {
                "session_id": s.id,
                "date": created.date().isoformat() if created else "",
                "score": sc,
                "focus": s.focus,
                "difficulty": s.difficulty,
                "curriculum_topic": getattr(s, "curriculum_topic", "") or "",
            }
        )

    # Per-focus averages
    focus_buckets: dict[str, list[float]] = {}
    for s, sc in scored:
        focus_buckets.setdefault(s.focus, []).append(sc)
    focus_averages = {
        focus: round(sum(vals) / len(vals), 1)
        for focus, vals in focus_buckets.items()
    }
    best_focus = max(focus_averages, key=focus_averages.get) if focus_averages else None
    worst_focus = min(focus_averages, key=focus_averages.get) if focus_averages else None

    # Per AI/ML curriculum topic averages (from question categories + summary topic_scores)
    topic_buckets: dict[str, list[float]] = {}
    for s in completed:
        summary = s.summary or {}
        topic_scores = summary.get("topic_scores") or {}
        has_summary_topic_scores = isinstance(topic_scores, dict) and bool(topic_scores)
        if isinstance(topic_scores, dict):
            for tid, sc in topic_scores.items():
                parsed = _parse_score(sc)
                if parsed is not None and tid in TOPIC_BY_ID:
                    topic_buckets.setdefault(str(tid), []).append(parsed)
        # Use per-question scores only when the summary did not already aggregate
        # the same session, avoiding double-counting.
        turns = turns_by_session.get(s.id or 0, [])
        questions = s.questions or []
        if has_summary_topic_scores:
            continue
        for t in turns:
            if t.role != "feedback" or not t.scores:
                continue
            q_idx = t.question_index
            cat = ""
            if 0 <= q_idx < len(questions):
                cat = str(questions[q_idx].get("category", ""))
            if cat in TOPIC_BY_ID:
                sc = _parse_score(t.scores.get("overall_score"))
                if sc is not None:
                    topic_buckets.setdefault(cat, []).append(sc)

    topic_averages = {
        tid: round(sum(vals) / len(vals), 1)
        for tid, vals in topic_buckets.items()
        if vals
    }
    best_topic = max(topic_averages, key=topic_averages.get) if topic_averages else None
    worst_topic = min(topic_averages, key=topic_averages.get) if topic_averages else None

    # Recurring themes from weaknesses + priority improvements
    theme_items: list[str] = []
    pointer_items: list[str] = []
    strength_items: list[str] = []

    for s in completed:
        for w in s.recurring_weaknesses or []:
            if w.strip():
                theme_items.append(w.strip())
        summary = s.summary or {}
        for item in summary.get("priority_improvements") or []:
            if isinstance(item, str) and item.strip():
                theme_items.append(item.strip())
        for item in summary.get("skill_pointers") or []:
            if isinstance(item, str) and item.strip():
                pointer_items.append(item.strip())
        for item in summary.get("strengths") or []:
            if isinstance(item, str) and item.strip():
                strength_items.append(item.strip())

    recurring_themes = _clustered_themes(theme_items, 8)
    skill_pointers = _clustered_themes(pointer_items, 6)
    top_strengths = _clustered_themes(strength_items, 6)

    delivery_values: dict[str, list[float]] = {
        "words_per_minute": [],
        "filler_rate_per_100": [],
        "pause_count": [],
    }
    for turns in turns_by_session.values():
        for turn in turns:
            if turn.role != "candidate":
                continue
            delivery = (turn.scores or {}).get("delivery") or {}
            for key in delivery_values:
                value = _parse_score(delivery.get(key))
                if value is not None:
                    delivery_values[key].append(value)
    delivery_averages = {
        key: round(sum(values) / len(values), 1)
        for key, values in delivery_values.items()
        if values
    }

    # Activity streak (consecutive calendar days with any session)
    session_dates = sorted(
        {
            s.created_at.date()
            for s in sessions
            if s.created_at
        },
        reverse=True,
    )
    streak = 0
    if session_dates:
        expected = session_dates[0]
        today = date.today()
        if expected >= today - timedelta(days=1):
            for d in session_dates:
                if d == expected:
                    streak += 1
                    expected = expected - timedelta(days=1)
                elif d < expected:
                    break

    # Trend: compare last 3 vs prior sessions
    trend = "stable"
    if len(scores) >= 4:
        recent = sum(scores[-3:]) / 3
        prior = sum(scores[:-3]) / max(len(scores) - 3, 1)
        if recent - prior >= 0.5:
            trend = "improving"
        elif prior - recent >= 0.5:
            trend = "declining"

    return {
        "total_sessions": len(sessions),
        "completed_sessions": len(completed),
        "scored_sessions": len(scored),
        "average_score": avg_score,
        "best_score": best_score,
        "worst_score": worst_score,
        "score_over_time": score_over_time,
        "focus_averages": focus_averages,
        "best_focus_area": best_focus,
        "weakest_focus_area": worst_focus,
        "topic_averages": topic_averages,
        "best_topic_area": best_topic,
        "weakest_topic_area": worst_topic,
        "topic_labels": {tid: topic_label(tid) for tid in topic_averages},
        "recurring_themes": recurring_themes,
        "skill_pointers": skill_pointers,
        "top_strengths": top_strengths,
        "activity_streak_days": streak,
        "trend": trend,
        "delivery_averages": delivery_averages,
    }
