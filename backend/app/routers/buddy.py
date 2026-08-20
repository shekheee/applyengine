from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlmodel import Session, select

from app.auth import get_current_user
from app.config import get_settings
from app.db import get_session
from app.models import BuddySession, ChatMessage, Memory, User, VocabularyTerm
from app.schemas import (
    BuddySessionCreate,
    BuddySessionUpdate,
    BuddyTurnIn,
    VocabularyCreate,
    VocabularyUpdate,
)
from app.services.coach import build_coach_messages
from app.services.conversations import (
    conversation_messages,
    owned_conversation,
    touch_conversation,
)
from app.services.profiles import get_base_profile

router = APIRouter(prefix="/api/buddy", tags=["buddy"])
settings = get_settings()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _owned_session(session_id: int, user: User, db: Session) -> BuddySession:
    practice = db.get(BuddySession, session_id)
    if not practice or practice.user_id != user.id:
        raise HTTPException(status_code=404, detail="Buddy session not found")
    return practice


def _session_dict(practice: BuddySession | None) -> dict | None:
    if practice is None:
        return None
    return {
        "id": practice.id,
        "conversation_id": practice.conversation_id,
        "topic": practice.topic,
        "goal": practice.goal,
        "target_minutes": practice.target_minutes,
        "spoken_seconds": round(practice.spoken_seconds or 0, 1),
        "turn_count": practice.turn_count,
        "words_spoken": practice.words_spoken,
        "status": practice.status,
        "started_at": practice.started_at.isoformat() if practice.started_at else "",
        "completed_at": (
            practice.completed_at.isoformat() if practice.completed_at else None
        ),
    }


def _term_dict(term: VocabularyTerm) -> dict:
    return {
        "id": term.id,
        "term": term.term,
        "meaning": term.meaning,
        "example": term.example,
        "source": term.source,
        "times_practised": term.times_practised,
        "confidence": term.confidence,
        "last_practised_at": (
            term.last_practised_at.isoformat() if term.last_practised_at else None
        ),
        "created_at": term.created_at.isoformat() if term.created_at else "",
    }


def _streaks(practice_dates: set[date], today: date) -> tuple[int, int]:
    if not practice_dates:
        return 0, 0

    anchor = today if today in practice_dates else today - timedelta(days=1)
    current = 0
    while anchor in practice_dates:
        current += 1
        anchor -= timedelta(days=1)

    longest = 0
    run = 0
    previous: date | None = None
    for practiced_on in sorted(practice_dates):
        run = run + 1 if previous and practiced_on == previous + timedelta(days=1) else 1
        longest = max(longest, run)
        previous = practiced_on
    return current, longest


def _record_progress(
    practice: BuddySession,
    spoken_seconds: float,
    words_spoken: int,
    turns: int,
) -> None:
    practice.spoken_seconds = max(0, practice.spoken_seconds + spoken_seconds)
    practice.words_spoken = max(0, practice.words_spoken + words_spoken)
    practice.turn_count = max(0, practice.turn_count + turns)
    practice.updated_at = _now()
    if practice.spoken_seconds >= practice.target_minutes * 60:
        practice.status = "completed"
        practice.completed_at = practice.completed_at or _now()


@router.get("/dashboard")
def dashboard(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    practices = db.exec(
        select(BuddySession)
        .where(BuddySession.user_id == user.id)
        .order_by(BuddySession.started_at.desc())
    ).all()
    terms = db.exec(
        select(VocabularyTerm)
        .where(VocabularyTerm.user_id == user.id)
        .order_by(VocabularyTerm.updated_at.desc())
    ).all()
    today = _now().date()
    practice_dates = {
        item.started_at.date()
        for item in practices
        if item.started_at and (item.spoken_seconds > 0 or item.status == "completed")
    }
    current_streak, longest_streak = _streaks(practice_dates, today)
    today_seconds = sum(
        item.spoken_seconds
        for item in practices
        if item.started_at and item.started_at.date() == today
    )
    active = next((item for item in practices if item.status == "active"), None)
    week_start = today - timedelta(days=6)
    week = []
    for offset in range(7):
        day = week_start + timedelta(days=offset)
        seconds = sum(
            item.spoken_seconds
            for item in practices
            if item.started_at and item.started_at.date() == day
        )
        week.append({"date": day.isoformat(), "minutes": round(seconds / 60, 1)})
    return {
        "active_session": _session_dict(active),
        "vocabulary": [_term_dict(term) for term in terms],
        "stats": {
            "today_seconds": round(today_seconds, 1),
            "today_minutes": round(today_seconds / 60, 1),
            "current_streak": current_streak,
            "longest_streak": longest_streak,
            "total_minutes": round(
                sum(item.spoken_seconds for item in practices) / 60, 1
            ),
            "sessions_completed": sum(
                1 for item in practices if item.status == "completed"
            ),
            "week": week,
        },
    }


@router.post("/sessions")
def start_session(
    body: BuddySessionCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    if body.conversation_id is not None:
        try:
            owned_conversation(body.conversation_id, user, db)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
    existing = db.exec(
        select(BuddySession)
        .where(BuddySession.user_id == user.id, BuddySession.status == "active")
        .order_by(BuddySession.started_at.desc())
    ).first()
    if existing and existing.started_at and existing.started_at.date() != _now().date():
        existing.status = "abandoned"
        existing.updated_at = _now()
        db.add(existing)
        db.commit()
        existing = None
    if existing:
        if body.conversation_id and not existing.conversation_id:
            existing.conversation_id = body.conversation_id
            db.add(existing)
            db.commit()
            db.refresh(existing)
        return _session_dict(existing)
    practice = BuddySession(
        user_id=user.id,
        conversation_id=body.conversation_id,
        topic=body.topic.strip() or "Open technical conversation",
        goal=body.goal.strip() or "Explain one idea clearly and concisely",
        target_minutes=body.target_minutes,
    )
    db.add(practice)
    db.commit()
    db.refresh(practice)
    return _session_dict(practice)


@router.patch("/sessions/{session_id}")
def update_session(
    session_id: int,
    body: BuddySessionUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    practice = _owned_session(session_id, user, db)
    _record_progress(
        practice,
        body.spoken_seconds_delta,
        body.words_spoken_delta,
        body.turn_count_delta,
    )
    if body.status is not None:
        if body.status not in {"active", "completed"}:
            raise HTTPException(status_code=422, detail="Invalid session status")
        practice.status = body.status
        practice.completed_at = _now() if body.status == "completed" else None
    db.add(practice)
    db.commit()
    db.refresh(practice)
    return _session_dict(practice)


@router.post("/turns")
def save_realtime_turn(
    body: BuddyTurnIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    if body.role not in {"user", "assistant"}:
        raise HTTPException(status_code=422, detail="Role must be user or assistant")
    try:
        conversation = owned_conversation(body.conversation_id, user, db)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    message = ChatMessage(
        user_id=user.id,
        conversation_id=conversation.id,
        role=body.role,
        content=body.content.strip(),
        model_served=settings.openai_realtime_model if body.role == "assistant" else "",
        provider_served="openai" if body.role == "assistant" else "",
    )
    db.add(message)
    touch_conversation(conversation)
    db.add(conversation)
    practice: BuddySession | None = None
    if body.session_id and body.role == "user":
        practice = _owned_session(body.session_id, user, db)
        _record_progress(
            practice,
            body.duration_seconds,
            body.word_count or len(body.content.split()),
            1,
        )
        db.add(practice)
    db.commit()
    db.refresh(message)
    return {"id": message.id, "session": _session_dict(practice)}


@router.post("/vocabulary")
def add_vocabulary(
    body: VocabularyCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    normalized = body.term.strip()
    terms = db.exec(
        select(VocabularyTerm).where(VocabularyTerm.user_id == user.id)
    ).all()
    existing = next(
        (term for term in terms if term.term.casefold() == normalized.casefold()),
        None,
    )
    if existing:
        existing.meaning = body.meaning.strip() or existing.meaning
        existing.example = body.example.strip() or existing.example
        existing.updated_at = _now()
        db.add(existing)
        db.commit()
        db.refresh(existing)
        return _term_dict(existing)
    term = VocabularyTerm(
        user_id=user.id,
        term=normalized,
        meaning=body.meaning.strip(),
        example=body.example.strip(),
        source=body.source.strip() or "manual",
    )
    db.add(term)
    db.commit()
    db.refresh(term)
    return _term_dict(term)


@router.patch("/vocabulary/{term_id}")
def update_vocabulary(
    term_id: int,
    body: VocabularyUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    term = db.get(VocabularyTerm, term_id)
    if not term or term.user_id != user.id:
        raise HTTPException(status_code=404, detail="Vocabulary term not found")
    if body.term is not None:
        term.term = body.term.strip()
    if body.meaning is not None:
        term.meaning = body.meaning.strip()
    if body.example is not None:
        term.example = body.example.strip()
    if body.confidence is not None:
        term.confidence = body.confidence
    if body.practise:
        term.times_practised += 1
        term.last_practised_at = _now()
    term.updated_at = _now()
    db.add(term)
    db.commit()
    db.refresh(term)
    return _term_dict(term)


@router.delete("/vocabulary/{term_id}")
def delete_vocabulary(
    term_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    term = db.get(VocabularyTerm, term_id)
    if not term or term.user_id != user.id:
        raise HTTPException(status_code=404, detail="Vocabulary term not found")
    db.delete(term)
    db.commit()
    return {"ok": True}


@router.post("/realtime")
async def create_realtime_session(
    request: Request,
    conversation_id: int = Query(...),
    session_id: int | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    if not settings.openai_realtime_enabled or not settings.openai_api_key:
        raise HTTPException(
            status_code=503,
            detail="Live conversation is unavailable; use Record one reply instead.",
        )
    try:
        owned_conversation(conversation_id, user, db)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    practice = _owned_session(session_id, user, db) if session_id else None
    raw_sdp = await request.body()
    if not raw_sdp or len(raw_sdp) > 200_000:
        raise HTTPException(status_code=422, detail="Invalid WebRTC offer")

    profile = get_base_profile(user, db)
    memories = db.exec(
        select(Memory).where(Memory.user_id == user.id).order_by(Memory.id.asc())
    ).all()
    history = conversation_messages(conversation_id, user, db)
    instructions = build_coach_messages(
        "",
        profile,
        memories,
        history,
        answer_length="concise",
        coach_mode="buddy",
    )[0]["content"]
    terms = db.exec(
        select(VocabularyTerm)
        .where(VocabularyTerm.user_id == user.id)
        .order_by(VocabularyTerm.updated_at.desc())
        .limit(12)
    ).all()
    if practice:
        instructions += (
            f"\n\nTODAY'S SPEAKING SESSION\nTopic: {practice.topic}"
            f"\nGoal: {practice.goal}\nTarget: {practice.target_minutes} minutes."
        )
    if terms:
        vocabulary = ", ".join(term.term for term in terms)
        instructions += (
            "\n\nACTIVE VOCABULARY\nInvite natural use of these words when relevant, "
            f"without forcing them: {vocabulary}."
        )
    instructions += (
        "\n\nLIVE VOICE RULES\nThe user should do at least 80% of the speaking. "
        "Speak briskly at a natural professional pace. Default to one short prompt or "
        "question of 10 to 25 words, then stop and listen. When the user explicitly asks "
        "for advice, an explanation, or your opinion, answer substantively in roughly 60 "
        "to 180 words before returning the conversation to them; use more only when they "
        "explicitly request a deep explanation. Never give an unsolicited mini-lecture or "
        "provide the full answer unless the user asks. "
        "Ask one question at a time, tolerate natural pauses, and let the user finish. "
        "Give at most one communication pointer of 12 words after every two or three user "
        "turns. If the user becomes repetitive, ask them to restate the idea in one sentence."
    )
    realtime_config = {
        "type": "realtime",
        "model": settings.openai_realtime_model,
        "instructions": instructions,
        # This is a safety ceiling, not a target. Billing is based on tokens
        # actually generated, while the prompt controls ordinary turn length.
        # The larger ceiling leaves room for explicitly requested advice.
        "max_output_tokens": 4096,
        "audio": {
            "input": {
                "transcription": {
                    "model": settings.speech_transcription_model_list[0]
                    if settings.speech_transcription_model_list
                    else "gpt-4o-transcribe",
                    "language": "en",
                },
                "noise_reduction": {"type": "far_field"},
                "turn_detection": {
                    # Adapt the pause to meaning: wait when the user's thought
                    # sounds unfinished, but respond quickly to a clear ending.
                    "type": "semantic_vad",
                    "eagerness": "medium",
                    "create_response": True,
                    # The browser confirms sustained speech before cancelling
                    # output, preserving deliberate barge-in without noise cuts.
                    "interrupt_response": False,
                },
            },
            "output": {
                "voice": settings.openai_realtime_voice,
                "speed": 1.15,
            },
        },
    }
    safety_id = hashlib.sha256(
        f"applyengine:{user.id}:{settings.jwt_secret}".encode()
    ).hexdigest()[:64]
    try:
        async with httpx.AsyncClient(timeout=25) as client:
            upstream = await client.post(
                "https://api.openai.com/v1/realtime/calls",
                headers={
                    "Authorization": f"Bearer {settings.openai_api_key}",
                    "OpenAI-Safety-Identifier": safety_id,
                },
                files={
                    "sdp": (None, raw_sdp.decode("utf-8"), "application/sdp"),
                    "session": (
                        None,
                        json.dumps(realtime_config),
                        "application/json",
                    ),
                },
            )
    except (httpx.HTTPError, UnicodeDecodeError) as exc:
        raise HTTPException(
            status_code=503,
            detail="Live conversation could not connect; use Record one reply instead.",
        ) from exc
    if upstream.status_code >= 400:
        raise HTTPException(
            status_code=503,
            detail="Live conversation is temporarily unavailable; use Record one reply instead.",
        )
    return Response(content=upstream.content, media_type="application/sdp")
