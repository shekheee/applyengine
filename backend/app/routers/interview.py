from __future__ import annotations

import json
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from app.auth import get_current_user
from app.db import get_session
from app.llm.coach_models import validate_coach_model
from app.models import InterviewSession, InterviewTurn, Job, Memory, Profile, User
from app.schemas import (
    InterviewAnswerIn,
    InterviewCompleteIn,
    InterviewFollowupIn,
    InterviewProgressOut,
    InterviewSessionCreate,
    InterviewSessionOut,
    InterviewTurnOut,
    TranscribeOut,
)
from app.services.interview_practice import (
    evaluate_answer,
    feedback_to_markdown,
    generate_questions,
    generate_summary,
    stream_followup_async,
    summary_to_markdown,
)
from app.services.interview_progress import build_interview_progress
from app.services.speech import transcribe_audio
from app.services.profiles import get_base_profile
from app.services.serialize import profile_to_text

router = APIRouter(prefix="/api/interview", tags=["interview"])


def _resolve_model(model: str | None) -> str | None:
    try:
        return validate_coach_model(model)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e


def _owned_session(session_id: int, user: User, db: Session) -> InterviewSession:
    s = db.get(InterviewSession, session_id)
    if not s or s.user_id != user.id:
        raise HTTPException(404, "Interview session not found")
    return s


def _snapshot_profile(profile: Profile | None):
    if profile is None:
        return None
    return SimpleNamespace(
        name=profile.name,
        email=profile.email,
        summary=profile.summary,
        skills=list(profile.skills or []),
        experience=list(profile.experience or []),
        projects=list(profile.projects or []),
        education=list(profile.education or []),
        raw_text=profile.raw_text,
    )


def _turn_out(t: InterviewTurn) -> InterviewTurnOut:
    return InterviewTurnOut(
        id=t.id or 0,
        session_id=t.session_id,
        question_index=t.question_index,
        role=t.role,
        content=t.content,
        scores=t.scores or {},
        created_at=t.created_at.isoformat() if t.created_at else "",
    )


def _session_out(s: InterviewSession, turns: list[InterviewTurn] | None = None) -> InterviewSessionOut:
    return InterviewSessionOut(
        id=s.id or 0,
        job_id=s.job_id,
        focus=s.focus,
        difficulty=s.difficulty,
        status=s.status,
        questions=s.questions or [],
        current_index=s.current_index,
        summary=s.summary or {},
        recurring_weaknesses=s.recurring_weaknesses or [],
        overall_score=s.overall_score,
        model_id=s.model_id,
        created_at=s.created_at.isoformat() if s.created_at else "",
        updated_at=s.updated_at.isoformat() if s.updated_at else "",
        turns=[_turn_out(t) for t in (turns or [])],
    )


@router.get("/progress", response_model=InterviewProgressOut)
def get_progress(
    db: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    sessions = db.exec(
        select(InterviewSession)
        .where(InterviewSession.user_id == user.id)
        .order_by(InterviewSession.id.asc())
    ).all()
    return build_interview_progress(sessions)


@router.post("/transcribe", response_model=TranscribeOut)
async def transcribe_answer(
    file: UploadFile = File(...),
    duration: float | None = Form(default=None),
    user: User = Depends(get_current_user),
):
    _ = user  # auth gate
    mime = file.content_type or "audio/webm"
    if not mime.startswith("audio/"):
        raise HTTPException(400, "Upload must be an audio file.")
    try:
        audio_bytes = await file.read()
        result = transcribe_audio(audio_bytes, mime, duration_hint=duration)
        return TranscribeOut(**result)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    except Exception as e:
        raise HTTPException(500, "Transcription failed. Try again or type your answer.") from e


@router.post("/sessions", response_model=InterviewSessionOut)
def create_session(
    body: InterviewSessionCreate,
    db: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    model_id = _resolve_model(body.model)
    profile = get_base_profile(user, db)
    if not profile:
        raise HTTPException(400, "Upload your base resume before starting interview practice.")

    job = None
    if body.job_id:
        job = db.get(Job, body.job_id)
        if not job or job.user_id != user.id:
            raise HTTPException(404, "Job not found")

    memories = db.exec(
        select(Memory).where(Memory.user_id == user.id).order_by(Memory.id.asc())
    ).all()

    questions = generate_questions(
        profile,
        job,
        memories,
        focus=body.focus,
        difficulty=body.difficulty,
        model_id=model_id,
    )

    session = InterviewSession(
        user_id=user.id,
        job_id=body.job_id,
        focus=body.focus,
        difficulty=body.difficulty,
        questions=questions,
        current_index=0,
        model_id=model_id or "",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return _session_out(session, [])


@router.get("/sessions", response_model=list[InterviewSessionOut])
def list_sessions(
    db: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    sessions = db.exec(
        select(InterviewSession)
        .where(InterviewSession.user_id == user.id)
        .order_by(InterviewSession.id.desc())
    ).all()
    return [_session_out(s) for s in sessions]


@router.get("/sessions/{session_id}", response_model=InterviewSessionOut)
def get_session_detail(
    session_id: int,
    db: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    s = _owned_session(session_id, user, db)
    turns = db.exec(
        select(InterviewTurn)
        .where(InterviewTurn.session_id == session_id)
        .order_by(InterviewTurn.id.asc())
    ).all()
    return _session_out(s, turns)


@router.post("/sessions/{session_id}/answer", response_model=InterviewTurnOut)
def submit_answer(
    session_id: int,
    body: InterviewAnswerIn,
    db: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    s = _owned_session(session_id, user, db)
    if s.status == "completed":
        raise HTTPException(400, "Session already completed")
    answer = body.answer.strip()
    if not answer:
        raise HTTPException(400, "Answer is empty")

    idx = body.question_index if body.question_index is not None else s.current_index
    questions = s.questions or []
    if idx < 0 or idx >= len(questions):
        raise HTTPException(400, "Invalid question index")

    profile = get_base_profile(user, db)
    job = db.get(Job, s.job_id) if s.job_id else None
    model_id = _resolve_model(body.model or s.model_id or None)

    prior = db.exec(
        select(InterviewTurn)
        .where(InterviewTurn.session_id == session_id)
        .order_by(InterviewTurn.id.asc())
    ).all()

    db.add(
        InterviewTurn(
            session_id=session_id,
            question_index=idx,
            role="candidate",
            content=answer,
        )
    )

    fb = evaluate_answer(
        questions[idx]["text"],
        answer,
        profile,
        job,
        prior,
        idx,
        model_id=model_id,
    )
    md = feedback_to_markdown(fb)
    turn = InterviewTurn(
        session_id=session_id,
        question_index=idx,
        role="feedback",
        content=md,
        scores=fb,
    )
    db.add(turn)
    s.updated_at = datetime.now(timezone.utc)
    db.add(s)
    db.commit()
    db.refresh(turn)
    return _turn_out(turn)


@router.post("/sessions/{session_id}/answer/stream")
async def submit_answer_stream(
    session_id: int,
    body: InterviewAnswerIn,
    db: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    s = _owned_session(session_id, user, db)
    if s.status == "completed":
        raise HTTPException(400, "Session already completed")
    answer = body.answer.strip()
    if not answer:
        raise HTTPException(400, "Answer is empty")

    idx = body.question_index if body.question_index is not None else s.current_index
    questions = s.questions or []
    if idx < 0 or idx >= len(questions):
        raise HTTPException(400, "Invalid question index")

    profile = get_base_profile(user, db)
    profile_snap = _snapshot_profile(profile)
    job = db.get(Job, s.job_id) if s.job_id else None
    model_id = _resolve_model(body.model or s.model_id or None)

    prior = db.exec(
        select(InterviewTurn)
        .where(InterviewTurn.session_id == session_id)
        .order_by(InterviewTurn.id.asc())
    ).all()

    question_text = questions[idx]["text"]
    user_id = user.id

    async def event_stream() -> AsyncIterator[str]:
        try:
            fb = evaluate_answer(
                question_text,
                answer,
                profile_snap,
                job,
                prior,
                idx,
                model_id=model_id,
            )
            md = feedback_to_markdown(fb)
            # Simulate streaming by chunking markdown for UX
            chunk_size = 40
            for i in range(0, len(md), chunk_size):
                yield f"data: {json.dumps({'type': 'token', 'content': md[i:i + chunk_size]})}\n\n"

            from app.db import engine
            from sqlmodel import Session as WriteSession

            with WriteSession(engine) as write_db:
                write_db.add(
                    InterviewTurn(
                        session_id=session_id,
                        question_index=idx,
                        role="candidate",
                        content=answer,
                    )
                )
                turn = InterviewTurn(
                    session_id=session_id,
                    question_index=idx,
                    role="feedback",
                    content=md,
                    scores=fb,
                )
                write_db.add(turn)
                sess = write_db.get(InterviewSession, session_id)
                if sess:
                    sess.updated_at = datetime.now(timezone.utc)
                    write_db.add(sess)
                write_db.commit()
                write_db.refresh(turn)

            yield f"data: {json.dumps({'type': 'done', 'feedback': fb, 'turn': _turn_out(turn).model_dump(mode='json')})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'detail': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/sessions/{session_id}/followup/stream")
async def followup_stream(
    session_id: int,
    body: InterviewFollowupIn,
    db: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    s = _owned_session(session_id, user, db)
    msg = body.message.strip()
    if not msg:
        raise HTTPException(400, "Message is empty")

    idx = body.question_index if body.question_index is not None else s.current_index
    questions = s.questions or []
    if idx < 0 or idx >= len(questions):
        raise HTTPException(400, "Invalid question index")

    profile = _snapshot_profile(get_base_profile(user, db))
    model_id = _resolve_model(body.model or s.model_id or None)
    question_text = questions[idx]["text"]

    turns = db.exec(
        select(InterviewTurn)
        .where(InterviewTurn.session_id == session_id, InterviewTurn.question_index == idx)
        .order_by(InterviewTurn.id.asc())
    ).all()
    history = []
    for t in turns:
        if t.role in ("candidate", "followup"):
            history.append({"role": "user", "content": t.content})
        elif t.role in ("feedback", "followup_reply"):
            history.append({"role": "assistant", "content": t.content})
    history.append({"role": "user", "content": msg})

    async def event_stream() -> AsyncIterator[str]:
        accumulated = ""
        try:
            async for token in stream_followup_async(
                question_text, history, profile, model_id=model_id
            ):
                accumulated += token
                yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

            from app.db import engine
            from sqlmodel import Session as WriteSession

            with WriteSession(engine) as write_db:
                write_db.add(
                    InterviewTurn(
                        session_id=session_id,
                        question_index=idx,
                        role="followup",
                        content=msg,
                    )
                )
                reply = InterviewTurn(
                    session_id=session_id,
                    question_index=idx,
                    role="followup_reply",
                    content=accumulated.strip(),
                )
                write_db.add(reply)
                sess = write_db.get(InterviewSession, session_id)
                if sess:
                    sess.updated_at = datetime.now(timezone.utc)
                    write_db.add(sess)
                write_db.commit()
                write_db.refresh(reply)

            yield f"data: {json.dumps({'type': 'done', 'content': accumulated.strip()})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'detail': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/sessions/{session_id}/next", response_model=InterviewSessionOut)
def next_question(
    session_id: int,
    db: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    s = _owned_session(session_id, user, db)
    if s.current_index + 1 >= len(s.questions or []):
        raise HTTPException(400, "No more questions — complete the session for a summary.")
    s.current_index += 1
    s.updated_at = datetime.now(timezone.utc)
    db.add(s)
    db.commit()
    db.refresh(s)
    turns = db.exec(
        select(InterviewTurn).where(InterviewTurn.session_id == session_id)
    ).all()
    return _session_out(s, turns)


@router.post("/sessions/{session_id}/complete", response_model=InterviewSessionOut)
def complete_session(
    session_id: int,
    body: InterviewCompleteIn = InterviewCompleteIn(),
    db: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    s = _owned_session(session_id, user, db)
    profile = get_base_profile(user, db)
    job = db.get(Job, s.job_id) if s.job_id else None
    model_id = _resolve_model(body.model or s.model_id or None)

    turns = db.exec(
        select(InterviewTurn)
        .where(InterviewTurn.session_id == session_id)
        .order_by(InterviewTurn.id.asc())
    ).all()

    summary = generate_summary(s, turns, profile, job, model_id=model_id)
    s.summary = summary
    s.recurring_weaknesses = summary.get("recurring_weaknesses") or []
    raw_score = summary.get("overall_score")
    try:
        s.overall_score = float(raw_score) if raw_score is not None else None
    except (TypeError, ValueError):
        s.overall_score = None
    s.status = "completed"
    s.updated_at = datetime.now(timezone.utc)
    db.add(s)
    db.commit()
    db.refresh(s)
    return _session_out(s, turns)
