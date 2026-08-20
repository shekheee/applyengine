from __future__ import annotations

import hashlib
import json
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response, StreamingResponse
from sqlmodel import Session, select
from starlette.concurrency import run_in_threadpool

from app.auth import get_current_user
from app.config import get_settings
from app.db import get_session
from app.llm.coach_models import validate_coach_model
from app.models import InterviewSession, InterviewTurn, Job, Memory, Profile, User
from app.schemas import (
    AudioDeliveryAnalysisOut,
    InterviewAnswerIn,
    InterviewCompleteIn,
    InterviewCurriculumOut,
    InterviewFollowupIn,
    InterviewLiveTtsIn,
    InterviewLiveTurnIn,
    InterviewRealtimeTurnIn,
    InterviewDeliveryUpdateIn,
    InterviewProgressOut,
    InterviewSessionCreate,
    InterviewSessionOut,
    InterviewSessionUpdate,
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
from app.services.live_interview import (
    apply_live_meta,
    build_realtime_interview_instructions,
    generate_live_summary,
    govern_live_meta,
    parse_interviewer_response,
    should_end_live_interview,
    stream_interviewer_turn_async,
)
from app.services.ml_interview_curriculum import (
    curriculum_for_api,
    is_ml_relevant_profile,
    normalize_curriculum_topic,
)
from app.services.speech import (
    analyze_audio_with_gemini,
    synthesize_speech,
    transcribe_audio,
)
from app.services.profiles import get_base_profile
from app.services.serialize import profile_to_text

router = APIRouter(prefix="/api/interview", tags=["interview"])
settings = get_settings()


def _parse_client_metrics(raw: str | None) -> dict:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _resolve_model(model: str | None) -> str | None:
    try:
        return validate_coach_model(model)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e


def _request_id(value: str | None) -> str:
    request_id = (value or "").strip()
    if len(request_id) > 128:
        raise HTTPException(422, "request_id must be 128 characters or fewer.")
    return request_id


def _turn_for_request(
    db: Session,
    session_id: int,
    request_id: str,
    role: str,
) -> InterviewTurn | None:
    if not request_id:
        return None
    return db.exec(
        select(InterviewTurn).where(
            InterviewTurn.session_id == session_id,
            InterviewTurn.request_id == request_id,
            InterviewTurn.role == role,
        )
    ).first()


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
        request_id=getattr(t, "request_id", "") or "",
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
        title=getattr(s, "title", "") or "",
        archived=bool(getattr(s, "archived", False)),
        focus=s.focus,
        difficulty=s.difficulty,
        curriculum_topic=getattr(s, "curriculum_topic", "") or "",
        mode=getattr(s, "mode", "text") or "text",
        live_state=getattr(s, "live_state", None) or {},
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


def _competency_blueprint(
    questions: list[dict], job: Job | None, focus: str
) -> list[dict[str, str]]:
    """Create a transparent coverage map from the JD and planned questions."""
    labels: dict[str, str] = {
        "behavioral": "Behavioural evidence",
        "role_technical": "Role-specific expertise",
        "case_study": "Structured problem solving",
        "leadership_stakeholder": "Leadership and stakeholder influence",
        "resume_deep_dive": "Resume evidence and impact",
    }
    blueprint: list[dict[str, str]] = []
    seen: set[str] = set()
    for question in questions:
        category = str(question.get("category", focus)).strip()
        key = category.lower()
        if key and key not in seen:
            seen.add(key)
            blueprint.append(
                {
                    "id": key,
                    "label": labels.get(key, key.replace("_", " ").title()),
                    "source": "practice focus",
                }
            )
    if job:
        for requirement in (job.requirements or [])[:4]:
            text = str(requirement).strip()
            key = text.lower()
            if text and key not in seen:
                seen.add(key)
                blueprint.append(
                    {"id": f"jd-{len(blueprint) + 1}", "label": text[:100], "source": "job description"}
                )
    return blueprint[:8]


@router.get("/curriculum", response_model=InterviewCurriculumOut)
def get_curriculum(
    db: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    profile = get_base_profile(user, db)
    data = curriculum_for_api()
    data["ml_profile_detected"] = is_ml_relevant_profile(profile)
    return data


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
    session_ids = [s.id for s in sessions if s.id]
    turns_by_session: dict[int, list[InterviewTurn]] = {}
    if session_ids:
        all_turns = db.exec(
            select(InterviewTurn).where(InterviewTurn.session_id.in_(session_ids))
        ).all()
        for t in all_turns:
            turns_by_session.setdefault(t.session_id, []).append(t)
    return build_interview_progress(sessions, turns_by_session)


@router.post("/transcribe", response_model=TranscribeOut)
async def transcribe_answer(
    file: UploadFile = File(...),
    duration: float | None = Form(default=None),
    client_metrics: str | None = Form(default=None),
    user: User = Depends(get_current_user),
):
    _ = user  # auth gate
    mime = file.content_type or "audio/webm"
    if not mime.startswith("audio/"):
        raise HTTPException(400, "Upload must be an audio file.")
    try:
        audio_bytes = await file.read()
        result = await run_in_threadpool(
            transcribe_audio,
            audio_bytes,
            mime,
            duration,
            _parse_client_metrics(client_metrics),
        )
        return TranscribeOut(**result)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    except Exception as e:
        raise HTTPException(500, "Transcription failed. Try again or type your answer.") from e


@router.post("/analyze-audio", response_model=AudioDeliveryAnalysisOut)
async def analyze_delivery_audio(
    file: UploadFile = File(...),
    transcript: str = Form(default=""),
    duration: float = Form(default=0),
    client_metrics: str | None = Form(default=None),
    user: User = Depends(get_current_user),
):
    _ = user
    mime = file.content_type or "audio/webm"
    if not mime.startswith("audio/"):
        raise HTTPException(400, "Upload must be an audio file.")
    audio_bytes = await file.read()
    result = await run_in_threadpool(
        analyze_audio_with_gemini,
        audio_bytes,
        mime,
        transcript,
        duration,
        _parse_client_metrics(client_metrics),
    )
    return AudioDeliveryAnalysisOut(**result)


@router.patch(
    "/sessions/{session_id}/turns/{request_id}/delivery",
    response_model=InterviewTurnOut,
)
def update_turn_delivery(
    session_id: int,
    request_id: str,
    body: InterviewDeliveryUpdateIn,
    db: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _owned_session(session_id, user, db)
    turn = _turn_for_request(db, session_id, _request_id(request_id), "candidate")
    if not turn:
        raise HTTPException(404, "Candidate answer is not available yet.")
    scores = dict(turn.scores or {})
    delivery = dict(scores.get("delivery") or {})
    delivery.update(body.delivery or {})
    scores["delivery"] = delivery
    turn.scores = scores
    db.add(turn)
    db.commit()
    db.refresh(turn)
    return _turn_out(turn)


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

    curriculum_topic = normalize_curriculum_topic(body.curriculum_topic)
    mode = (body.mode or "text").strip().lower()
    if mode not in ("text", "live"):
        raise HTTPException(422, "mode must be 'text' or 'live'")
    behavior_mode = (body.behavior_mode or "simulation").strip().lower()
    if behavior_mode not in ("simulation", "coach"):
        raise HTTPException(422, "behavior_mode must be 'simulation' or 'coach'")
    persona = (body.interviewer_persona or "hiring_manager").strip().lower()
    allowed_personas = {
        "hiring_manager",
        "recruiter",
        "technical_panel",
        "skeptical_stakeholder",
        "change_leader",
    }
    if persona not in allowed_personas:
        raise HTTPException(422, "Unsupported interviewer persona")
    captions = (body.captions or "progressive").strip().lower()
    if captions not in ("progressive", "hidden"):
        raise HTTPException(422, "captions must be 'progressive' or 'hidden'")

    questions = generate_questions(
        profile,
        job,
        memories,
        focus=body.focus,
        difficulty=body.difficulty,
        model_id=model_id,
        curriculum_topic=curriculum_topic,
        question_count=4 if mode == "live" else 6,
        instant=mode == "live",
    )

    session = InterviewSession(
        user_id=user.id,
        job_id=body.job_id,
        title=(f"{job.company} · {job.title}" if job else f"{body.focus.replace('_', ' ').title()} interview"),
        focus=body.focus,
        difficulty=body.difficulty,
        curriculum_topic=curriculum_topic,
        mode=mode,
        live_state={
            "competency_blueprint": _competency_blueprint(questions, job, body.focus),
            "behavior_mode": behavior_mode,
            "interviewer_persona": persona,
            "captions": captions,
            "stage": "introduction",
        },
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
        .where(
            InterviewSession.user_id == user.id,
            InterviewSession.archived == False,  # noqa: E712
        )
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


@router.post("/sessions/{session_id}/realtime")
async def create_realtime_interview(
    session_id: int,
    request: Request,
    db: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Proxy the WebRTC offer so the browser never receives the OpenAI API key."""
    if not settings.openai_realtime_enabled or not settings.openai_api_key:
        raise HTTPException(
            status_code=503,
            detail="Realtime voice is unavailable; use the recorded-answer fallback.",
        )
    interview = _owned_session(session_id, user, db)
    if interview.status == "completed":
        raise HTTPException(status_code=400, detail="Interview session already completed")
    if interview.mode != "live":
        raise HTTPException(status_code=400, detail="Realtime voice requires a live interview")
    raw_sdp = await request.body()
    if not raw_sdp or len(raw_sdp) > 200_000:
        raise HTTPException(status_code=422, detail="Invalid WebRTC offer")

    profile = get_base_profile(user, db)
    job = db.get(Job, interview.job_id) if interview.job_id else None
    turns = db.exec(
        select(InterviewTurn)
        .where(InterviewTurn.session_id == session_id)
        .order_by(InterviewTurn.id.asc())
    ).all()
    instructions = build_realtime_interview_instructions(
        interview,
        profile,
        job,
        turns,
    )
    realtime_config = {
        "type": "realtime",
        "model": settings.openai_realtime_model,
        "instructions": instructions,
        # Spoken interview turns should be short; a frontier text model is used
        # later for the detailed post-session assessment.
        "max_output_tokens": 220,
        "tools": [
            {
                "type": "function",
                "name": "end_interview",
                "description": (
                    "End the interview after asking for candidate questions and "
                    "speaking a brief closing sentence."
                ),
                "parameters": {"type": "object", "properties": {}},
            }
        ],
        "tool_choice": "auto",
        "audio": {
            "input": {
                "transcription": {
                    "model": settings.speech_transcription_model_list[0]
                    if settings.speech_transcription_model_list
                    else "gpt-4o-transcribe"
                },
                "turn_detection": {
                    "type": "server_vad",
                    "threshold": 0.5,
                    "prefix_padding_ms": 300,
                    # Long enough for a thinking pause, short enough to avoid the
                    # stop/upload/transcribe delay of the legacy interview path.
                    "silence_duration_ms": 900,
                    "create_response": True,
                    "interrupt_response": True,
                },
            },
            "output": {"voice": settings.openai_realtime_voice},
        },
    }
    safety_id = hashlib.sha256(
        f"applyengine-interview:{user.id}:{settings.jwt_secret}".encode()
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
            detail="Realtime interview could not connect; use recorded-answer mode.",
        ) from exc
    if upstream.status_code >= 400:
        raise HTTPException(
            status_code=503,
            detail="Realtime interview is temporarily unavailable; use recorded-answer mode.",
        )

    state = dict(interview.live_state or {})
    state.update(
        realtime_enabled=True,
        realtime_model=settings.openai_realtime_model,
        transport="webrtc",
    )
    interview.live_state = state
    interview.updated_at = datetime.now(timezone.utc)
    db.add(interview)
    db.commit()
    return Response(
        content=upstream.content,
        media_type="application/sdp",
        headers={"X-Realtime-Model": settings.openai_realtime_model},
    )


@router.post(
    "/sessions/{session_id}/realtime/turns",
    response_model=InterviewTurnOut,
)
def save_realtime_interview_turn(
    session_id: int,
    body: InterviewRealtimeTurnIn,
    db: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    interview = _owned_session(session_id, user, db)
    if interview.status == "completed":
        raise HTTPException(status_code=400, detail="Interview session already completed")
    role = body.role.strip().lower()
    if role not in {"candidate", "interviewer"}:
        raise HTTPException(status_code=422, detail="Role must be candidate or interviewer")
    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=422, detail="Turn content is empty")
    if len(content) > 20_000:
        raise HTTPException(status_code=422, detail="Turn content is too long")
    request_id = _request_id(body.request_id) or f"realtime-{uuid4()}"
    existing = _turn_for_request(db, session_id, request_id, role)
    if existing:
        return _turn_out(existing)

    candidate_count = len(
        db.exec(
            select(InterviewTurn).where(
                InterviewTurn.session_id == session_id,
                InterviewTurn.role == "candidate",
            )
        ).all()
    )
    question_count = max(1, len(interview.questions or []))
    question_index = min(candidate_count, question_count - 1)
    scores: dict = {"transport": "webrtc", "realtime": True}
    if role == "candidate":
        duration = max(0.0, float(body.duration_seconds or 0))
        word_count = len(content.split())
        scores.update(
            candidate_intent="answer",
            delivery={
                "duration_seconds": round(duration, 2),
                "word_count": word_count,
                "words_per_minute": (
                    round(word_count * 60 / duration) if duration >= 1 else 0
                ),
            },
        )
    else:
        scores["_routing"] = {
            "provider_served": "openai",
            "model_served": settings.openai_realtime_model,
            "fallback_used": False,
        }
        if body.latency_ms is not None:
            scores["latency_ms"] = max(0, int(body.latency_ms))

    turn = InterviewTurn(
        session_id=session_id,
        request_id=request_id,
        question_index=question_index,
        role=role,
        content=content,
        scores=scores,
    )
    db.add(turn)
    state = dict(interview.live_state or {})
    state["transport"] = "webrtc"
    state["realtime_model"] = settings.openai_realtime_model
    state["turn_count"] = int(state.get("turn_count", 0)) + 1
    if role == "interviewer" and body.latency_ms is not None:
        state["last_latency_ms"] = max(0, int(body.latency_ms))
    interview.live_state = state
    interview.current_index = question_index
    interview.updated_at = datetime.now(timezone.utc)
    db.add(interview)
    db.commit()
    db.refresh(turn)
    return _turn_out(turn)


@router.patch("/sessions/{session_id}", response_model=InterviewSessionOut)
def update_session(
    session_id: int,
    body: InterviewSessionUpdate,
    db: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    s = _owned_session(session_id, user, db)
    if body.title is not None:
        title = body.title.strip()
        if len(title) > 120:
            raise HTTPException(422, "Session title must be 120 characters or fewer.")
        s.title = title
    if body.archived is not None:
        s.archived = body.archived
    s.updated_at = datetime.now(timezone.utc)
    db.add(s)
    db.commit()
    db.refresh(s)
    return _session_out(s)


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(
    session_id: int,
    db: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    s = _owned_session(session_id, user, db)
    turns = db.exec(
        select(InterviewTurn).where(InterviewTurn.session_id == session_id)
    ).all()
    for turn in turns:
        db.delete(turn)
    db.delete(s)
    db.commit()
    return Response(status_code=204)


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
    request_id = _request_id(body.request_id)
    existing = _turn_for_request(db, session_id, request_id, "feedback")
    if existing:
        return _turn_out(existing)

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
            request_id=request_id,
            scores={"delivery": body.delivery or {}} if body.delivery else {},
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
        curriculum_topic=getattr(s, "curriculum_topic", "") or "",
        question_category=str(questions[idx].get("category", "")),
    )
    md = feedback_to_markdown(fb)
    turn = InterviewTurn(
        session_id=session_id,
        question_index=idx,
        role="feedback",
        content=md,
        scores=fb,
        request_id=request_id,
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
    request_id = _request_id(body.request_id)
    existing = _turn_for_request(db, session_id, request_id, "feedback")
    if existing:
        async def replay_existing() -> AsyncIterator[str]:
            yield f"data: {json.dumps({'type': 'token', 'content': existing.content})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'feedback': existing.scores or {}, 'turn': _turn_out(existing).model_dump(mode='json'), 'replayed': True})}\n\n"

        return StreamingResponse(
            replay_existing(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

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
                curriculum_topic=getattr(s, "curriculum_topic", "") or "",
                question_category=str(questions[idx].get("category", "")),
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
                        request_id=request_id,
                        scores={"delivery": body.delivery or {}} if body.delivery else {},
                    )
                )
                turn = InterviewTurn(
                    session_id=session_id,
                    question_index=idx,
                    role="feedback",
                    content=md,
                    scores=fb,
                    request_id=request_id,
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


@router.post("/sessions/{session_id}/live/turn/stream")
async def live_turn_stream(
    session_id: int,
    body: InterviewLiveTurnIn,
    db: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    s = _owned_session(session_id, user, db)
    if getattr(s, "mode", "text") != "live":
        raise HTTPException(400, "Session is not a live interview.")
    if s.status == "completed":
        raise HTTPException(400, "Session already completed")

    profile = get_base_profile(user, db)
    profile_snap = _snapshot_profile(profile)
    job = db.get(Job, s.job_id) if s.job_id else None
    model_id = _resolve_model(body.model or s.model_id or None)
    request_id = _request_id(body.request_id)

    existing_interviewer = _turn_for_request(
        db, session_id, request_id, "interviewer"
    )
    if existing_interviewer:
        async def replay_existing() -> AsyncIterator[str]:
            scores = existing_interviewer.scores or {}
            yield f"data: {json.dumps({'type': 'token', 'content': existing_interviewer.content})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'speech': existing_interviewer.content, 'meta': scores, 'end_interview': bool(scores.get('end_interview')), 'turn': _turn_out(existing_interviewer).model_dump(mode='json'), 'current_index': s.current_index, 'replayed': True})}\n\n"

        return StreamingResponse(
            replay_existing(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    turns = db.exec(
        select(InterviewTurn)
        .where(InterviewTurn.session_id == session_id)
        .order_by(InterviewTurn.id.asc())
    ).all()

    candidate_answer = (body.candidate_answer or "").strip() or None
    candidate_intent = (body.candidate_intent or "answer").strip().lower()
    if candidate_intent not in ("answer", "clarification", "candidate_question"):
        raise HTTPException(
            422,
            "candidate_intent must be 'answer', 'clarification', or 'candidate_question'",
        )
    existing_candidate = _turn_for_request(db, session_id, request_id, "candidate")
    if candidate_answer and not existing_candidate:
        db.add(
            InterviewTurn(
                session_id=session_id,
                question_index=s.current_index,
                role="candidate",
                content=candidate_answer,
                request_id=request_id,
                scores={
                    **({"delivery": body.delivery or {}} if body.delivery else {}),
                    "candidate_intent": candidate_intent,
                },
            )
        )
        s.updated_at = datetime.now(timezone.utc)
        db.add(s)
        db.commit()
        db.refresh(s)
        turns = db.exec(
            select(InterviewTurn)
            .where(InterviewTurn.session_id == session_id)
            .order_by(InterviewTurn.id.asc())
        ).all()

    async def event_stream() -> AsyncIterator[str]:
        accumulated = ""
        routing: dict = {}
        try:
            async for token in stream_interviewer_turn_async(
                s,
                profile_snap,
                job,
                turns,
                candidate_answer=candidate_answer,
                model_id=model_id,
                routing_out=routing,
                candidate_intent=candidate_intent,
            ):
                accumulated += token
                yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

            speech, meta = parse_interviewer_response(accumulated)
            meta = govern_live_meta(
                s,
                meta,
                candidate_answer=candidate_answer,
                candidate_intent=candidate_intent,
            )
            end_interview = should_end_live_interview(s, meta)

            from app.db import engine
            from sqlmodel import Session as WriteSession

            with WriteSession(engine) as write_db:
                sess = write_db.get(InterviewSession, session_id)
                if not sess:
                    raise HTTPException(404, "Session not found")
                apply_live_meta(sess, meta)
                turn = InterviewTurn(
                    session_id=session_id,
                    question_index=sess.current_index,
                    role="interviewer",
                    content=speech,
                    scores={
                        "action": meta.get("action"),
                        "end_interview": end_interview,
                        **meta,
                        "_routing": routing,
                    },
                    request_id=request_id,
                )
                write_db.add(turn)
                sess.updated_at = datetime.now(timezone.utc)
                write_db.add(sess)
                write_db.commit()
                write_db.refresh(turn)
                write_db.refresh(sess)
                current_index = sess.current_index
            yield f"data: {json.dumps({'type': 'done', 'speech': speech, 'meta': meta, 'end_interview': end_interview, 'turn': _turn_out(turn).model_dump(mode='json'), 'current_index': current_index})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'detail': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/sessions/{session_id}/live/tts")
def live_tts(
    session_id: int,
    body: InterviewLiveTtsIn,
    db: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    s = _owned_session(session_id, user, db)
    if getattr(s, "mode", "text") != "live":
        raise HTTPException(400, "Session is not a live interview.")
    try:
        audio_bytes, mime = synthesize_speech(body.text.strip(), voice=body.voice or "nova")
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    return Response(
        content=audio_bytes,
        media_type=mime,
        headers={"Cache-Control": "no-store"},
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
    if s.status == "completed" and s.summary:
        turns = db.exec(
            select(InterviewTurn)
            .where(InterviewTurn.session_id == session_id)
            .order_by(InterviewTurn.id.asc())
        ).all()
        return _session_out(s, turns)
    profile = get_base_profile(user, db)
    job = db.get(Job, s.job_id) if s.job_id else None
    model_id = _resolve_model(body.model or s.model_id or None)

    turns = db.exec(
        select(InterviewTurn)
        .where(InterviewTurn.session_id == session_id)
        .order_by(InterviewTurn.id.asc())
    ).all()
    candidate_answers = [
        turn
        for turn in turns
        if turn.role == "candidate"
        and turn.content.strip()
        and (turn.scores or {}).get("candidate_intent", "answer") == "answer"
    ]
    if not candidate_answers:
        raise HTTPException(
            400,
            "Answer at least one interview question before ending the session.",
        )

    if getattr(s, "mode", "text") == "live":
        summary = generate_live_summary(s, turns, profile, job, model_id=model_id)
    else:
        summary = generate_summary(s, turns, profile, job, model_id=model_id)
    answered_questions = len({turn.question_index for turn in candidate_answers})
    summary["partial_session"] = answered_questions < len(s.questions or [])
    summary["answered_questions"] = answered_questions
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
