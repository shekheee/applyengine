from __future__ import annotations

import json
import re
from collections.abc import Iterator
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from app.auth import get_current_user, oauth2_scheme
from app.db import engine, get_session
from app.llm import build_coach_provider
from app.models import (
    PrepAttempt,
    PrepFeedback,
    PrepHintReveal,
    PrepRedo,
    PrepReviewToken,
    PrepSettings,
    PrepTask,
    PrepTutorMessage,
    User,
)
from app.schemas import (
    PrepAttemptIn,
    PrepAttemptOut,
    PrepAttemptResultOut,
    PrepCheckIn,
    PrepFeedbackOut,
    PrepHintRevealIn,
    PrepHintsOut,
    PrepPlanOut,
    PrepRedoOut,
    PrepReviewTokenOut,
    PrepSettingsIn,
    PrepSettingsOut,
    PrepTaskDetailOut,
    PrepTodayOut,
    PrepTutorIn,
    PrepTutorMessageOut,
)
from app.services.prep_redos import new_redos
from app.services.prep_schedule import NEETCODE_URL, build_plan, build_today, neetcode_task_id
from app.services.prep_review import (
    TOKEN_PREFIX,
    build_daily_log,
    hash_review_token,
    new_review_token,
)
from app.services.prep_seed import program, rules
from app.services.prep_tutor import (
    OFFLINE_FOLLOWUP,
    followup_messages,
    offline_review,
    review_messages,
)

router = APIRouter(prefix="/api/prep", tags=["prep"])

CHECKLIST_NOTE = "Ticked from the Today checklist."
NEETCODE_ID = re.compile(r"^nc-(\d{4}-\d{2}-\d{2})$")
NEETCODE_TITLE = "1 unseen medium from NeetCode 150"


def _neetcode_day(task_id: str) -> date | None:
    match = NEETCODE_ID.match(task_id)
    if not match:
        return None
    try:
        return date.fromisoformat(match.group(1))
    except ValueError:
        return None


def _attempt_out(attempt: PrepAttempt) -> PrepAttemptOut:
    return PrepAttemptOut.model_validate(attempt, from_attributes=True)


def _redo_out(redo: PrepRedo) -> PrepRedoOut:
    return PrepRedoOut.model_validate(redo, from_attributes=True)


def get_prep_user(
    token: str | None = Depends(oauth2_scheme),
    session: Session = Depends(get_session),
) -> User:
    """A signed-in user, or the nightly script presenting its review token."""
    if token and token.startswith(TOKEN_PREFIX):
        row = session.exec(
            select(PrepReviewToken).where(
                PrepReviewToken.token_hash == hash_review_token(token)
            )
        ).first()
        user = session.get(User, row.user_id) if row else None
        if not row or not user:
            raise HTTPException(
                401, "Invalid review token", headers={"WWW-Authenticate": "Bearer"}
            )
        row.last_used_at = datetime.now(timezone.utc)
        session.add(row)
        session.commit()
        return user
    return get_current_user(token, session)


def _settings(user: User, session: Session) -> PrepSettings | None:
    return session.exec(select(PrepSettings).where(PrepSettings.user_id == user.id)).first()


def _require_near_today(day: date) -> None:
    """Writes use the browser's local date; reject anything outside +/- 1 day of UTC."""
    utc_today = datetime.now(timezone.utc).date()
    if abs((day - utc_today).days) > 1:
        raise HTTPException(422, "Date must be today in your local timezone")


@router.get("/settings", response_model=PrepSettingsOut)
def get_settings(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    settings = _settings(user, session)
    if not settings:
        return PrepSettingsOut(configured=False)
    return PrepSettingsOut(
        configured=True,
        start_date=settings.start_date,
        hours_per_week=settings.hours_per_week,
    )


@router.put("/settings", response_model=PrepSettingsOut)
def put_settings(
    body: PrepSettingsIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    settings = _settings(user, session) or PrepSettings(
        user_id=user.id, start_date=body.start_date
    )
    settings.start_date = body.start_date
    settings.hours_per_week = body.hours_per_week
    settings.updated_at = datetime.now(timezone.utc)
    session.add(settings)
    session.commit()
    session.refresh(settings)
    return PrepSettingsOut(
        configured=True,
        start_date=settings.start_date,
        hours_per_week=settings.hours_per_week,
    )


@router.get("/today", response_model=PrepTodayOut)
def get_today(
    day: date = Query(alias="date"),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    info = program()
    base = {
        "program_name": info.get("name", "Interview Prep"),
        "doc_url": info.get("doc_url"),
        "date": day,
    }
    settings = _settings(user, session)
    if not settings:
        return PrepTodayOut(configured=False, **base)

    tasks = list(session.exec(select(PrepTask)).all())
    attempts = list(
        session.exec(
            select(PrepAttempt).where(PrepAttempt.user_id == user.id, PrepAttempt.date <= day)
        ).all()
    )
    redos = list(session.exec(select(PrepRedo).where(PrepRedo.user_id == user.id)).all())
    plan = build_today(tasks, settings.start_date, day, attempts, redos)

    feedback = session.exec(
        select(PrepFeedback)
        .where(PrepFeedback.user_id == user.id, PrepFeedback.date < day)
        .order_by(PrepFeedback.date.desc(), PrepFeedback.created_at.desc())  # type: ignore[attr-defined]
    ).first()
    return PrepTodayOut(
        configured=True,
        **base,
        **plan,
        feedback=PrepFeedbackOut(
            date=feedback.date, markdown=feedback.markdown, created_at=feedback.created_at
        )
        if feedback
        else None,
    )


@router.post("/check", response_model=PrepTodayOut)
def check_item(
    body: PrepCheckIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _require_near_today(body.date)
    task = session.get(PrepTask, body.task_id)
    if task is None and body.task_id != neetcode_task_id(body.date):
        raise HTTPException(404, "Task not found")

    redos: list[PrepRedo] = []
    if body.redo_id is not None:
        redo = session.get(PrepRedo, body.redo_id)
        if not redo or redo.user_id != user.id or redo.task_id != body.task_id:
            raise HTTPException(404, "Redo not found")
        # Clearing one redo clears every redo of the task that is already due.
        redos = list(
            session.exec(
                select(PrepRedo).where(
                    PrepRedo.user_id == user.id,
                    PrepRedo.task_id == body.task_id,
                    PrepRedo.due_date <= max(body.date, redo.due_date),
                )
            ).all()
        )

    existing = session.exec(
        select(PrepAttempt).where(
            PrepAttempt.user_id == user.id,
            PrepAttempt.task_id == body.task_id,
            PrepAttempt.date == body.date,
        )
    ).all()

    if body.done:
        if not existing:
            session.add(
                PrepAttempt(
                    user_id=user.id,
                    task_id=body.task_id,
                    title=task.title if task else "NeetCode 150 medium",
                    date=body.date,
                    ended_at=datetime.now(timezone.utc),
                    elapsed_minutes=0,
                    solved="yes",
                    notes=CHECKLIST_NOTE,
                )
            )
        for redo in redos:
            if not redo.done:
                redo.done = True
                redo.completed_on = body.date
                session.add(redo)
    else:
        # Only undo the quick tick; attempts logged with real detail stay put.
        for attempt in existing:
            if attempt.notes == CHECKLIST_NOTE:
                session.delete(attempt)
        for redo in redos:
            if redo.done and redo.completed_on == body.date:
                redo.done = False
                redo.completed_on = None
                session.add(redo)
    session.commit()
    return get_today(day=body.date, session=session, user=user)


@router.get("/feedback", response_model=list[PrepFeedbackOut])
def list_feedback(
    limit: int = Query(default=30, ge=1, le=200),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    rows = session.exec(
        select(PrepFeedback)
        .where(PrepFeedback.user_id == user.id)
        .order_by(PrepFeedback.date.desc(), PrepFeedback.created_at.desc())  # type: ignore[attr-defined]
        .limit(limit)
    ).all()
    return [PrepFeedbackOut(date=r.date, markdown=r.markdown, created_at=r.created_at) for r in rows]



def _hint_tiers(task: PrepTask) -> int:
    """Written hints, then the full solution as the final tier when there is one."""
    hints = len(task.hints or [])
    return hints + 1 if hints and task.solution else hints


def _revealed_hints(user: User, task_id: str, day: date, session: Session) -> list[PrepHintReveal]:
    return list(
        session.exec(
            select(PrepHintReveal)
            .where(
                PrepHintReveal.user_id == user.id,
                PrepHintReveal.task_id == task_id,
                PrepHintReveal.date == day,
            )
            .order_by(PrepHintReveal.level)
        ).all()
    )


@router.get("/tasks/{task_id}", response_model=PrepTaskDetailOut)
def get_task(
    task_id: str,
    day: date | None = Query(default=None, alias="date"),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    attempts = session.exec(
        select(PrepAttempt)
        .where(PrepAttempt.user_id == user.id, PrepAttempt.task_id == task_id)
        .order_by(PrepAttempt.date.desc(), PrepAttempt.id.desc())  # type: ignore[attr-defined]
        .limit(10)
    ).all()
    open_redos = session.exec(
        select(PrepRedo)
        .where(
            PrepRedo.user_id == user.id,
            PrepRedo.task_id == task_id,
            PrepRedo.done == False,  # noqa: E712
        )
        .order_by(PrepRedo.due_date)
    ).all()
    history = {
        "rules": rules(),
        "attempts": [_attempt_out(a) for a in attempts],
        "open_redos": [_redo_out(r) for r in open_redos],
    }

    task = session.get(PrepTask, task_id)
    if task is not None:
        hints = task.hints or []
        revealed = len(_revealed_hints(user, task_id, day, session)) if day else 0
        solution_revealed = bool(hints) and revealed > len(hints)
        unlocked = bool(attempts) or solution_revealed
        content = {
            "statement": task.statement,
            "brief": task.brief,
            "learn": task.learn,
            "starter": task.starter,
            "tests": task.tests or [],
            "levels": task.levels,
            "hints_total": _hint_tiers(task),
            "hints_revealed": hints[:revealed],
            # The ideal solution unlocks with a logged attempt, or when opened as the last hint.
            "solution": task.solution if unlocked else None,
            "solution_locked": bool(task.solution) and not unlocked,
            "solution_revealed": solution_revealed,
        }
        return PrepTaskDetailOut(
            **task.model_dump(
                include=set(PrepTaskDetailOut.model_fields) - set(content) - set(history)
            ),
            **history,
            **content,
        )
    if _neetcode_day(task_id) is None:
        raise HTTPException(404, "Task not found")
    named = next((a.title for a in attempts if a.title), "")
    return PrepTaskDetailOut(
        id=task_id,
        type="dsa",
        week=10,
        slot="morning",
        title=named or NEETCODE_TITLE,
        url=NEETCODE_URL,
        target_minutes=int(rules().get("max_minutes_dsa", 40)),
        synthetic=True,
        **history,
    )


@router.post("/attempts", response_model=PrepAttemptResultOut)
def create_attempt(
    body: PrepAttemptIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _require_near_today(body.date)
    task = session.get(PrepTask, body.task_id)
    if task is None:
        nc_day = _neetcode_day(body.task_id)
        if nc_day is None or nc_day > body.date:
            raise HTTPException(404, "Task not found")
        if not body.title.strip():
            raise HTTPException(422, "Name the NeetCode problem you solved")
    target = task.target_minutes if task else int(rules().get("max_minutes_dsa", 40))

    # A logged attempt supersedes a quick checklist tick for the same day.
    for quick in session.exec(
        select(PrepAttempt).where(
            PrepAttempt.user_id == user.id,
            PrepAttempt.task_id == body.task_id,
            PrepAttempt.date == body.date,
            PrepAttempt.notes == CHECKLIST_NOTE,
        )
    ).all():
        session.delete(quick)

    attempt = PrepAttempt(
        user_id=user.id,
        task_id=body.task_id,
        title=body.title.strip() or (task.title if task else NEETCODE_TITLE),
        date=body.date,
        started_at=body.started_at,
        ended_at=body.ended_at or datetime.now(timezone.utc),
        elapsed_minutes=round(body.elapsed_minutes, 2),
        # A hint opened during the session counts, whatever the form says.
        hint_used=body.hint_used
        or bool(_revealed_hints(user, body.task_id, body.date, session)),
        solved=body.solved,
        self_rating=body.self_rating,
        code=body.code,
        notes=body.notes,
        complexity=body.complexity.strip(),
        diagram=body.diagram,
    )
    session.add(attempt)
    session.flush()

    # Any attempt clears the task's redos that are already due.
    open_redos = session.exec(
        select(PrepRedo).where(
            PrepRedo.user_id == user.id,
            PrepRedo.task_id == body.task_id,
            PrepRedo.done == False,  # noqa: E712
        )
    ).all()
    cleared = 0
    still_open = []
    for redo in open_redos:
        if redo.due_date <= body.date:
            redo.done = True
            redo.completed_on = body.date
            session.add(redo)
            cleared += 1
        else:
            still_open.append(redo)

    created = new_redos(attempt, target, still_open, rules())
    for redo in created:
        session.add(redo)
    session.commit()
    session.refresh(attempt)
    for redo in created:
        session.refresh(redo)
    return PrepAttemptResultOut(
        attempt=_attempt_out(attempt),
        redos_created=[_redo_out(r) for r in created],
        redos_cleared=cleared,
    )


@router.get("/plan", response_model=PrepPlanOut)
def get_plan(
    day: date = Query(alias="date"),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    settings = _settings(user, session)
    tasks = list(session.exec(select(PrepTask)).all())
    attempts = list(session.exec(select(PrepAttempt).where(PrepAttempt.user_id == user.id)).all())
    redos = list(session.exec(select(PrepRedo).where(PrepRedo.user_id == user.id)).all())
    plan = build_plan(tasks, settings.start_date if settings else None, day, attempts, redos)
    return PrepPlanOut(configured=settings is not None, **plan)


def _utc(moment: datetime | None) -> datetime | None:
    """SQLite drops tzinfo; these timestamps are always stored in UTC."""
    if moment is None or moment.tzinfo is not None:
        return moment
    return moment.replace(tzinfo=timezone.utc)


def _token_out(row: PrepReviewToken | None, token: str | None = None) -> PrepReviewTokenOut:
    if not row:
        return PrepReviewTokenOut(exists=False)
    return PrepReviewTokenOut(
        exists=True,
        created_at=_utc(row.created_at),
        last_used_at=_utc(row.last_used_at),
        token=token,
    )


def _token_row(user: User, session: Session) -> PrepReviewToken | None:
    return session.exec(
        select(PrepReviewToken).where(PrepReviewToken.user_id == user.id)
    ).first()


@router.get("/review-token", response_model=PrepReviewTokenOut)
def get_review_token(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    return _token_out(_token_row(user, session))


@router.post("/review-token", response_model=PrepReviewTokenOut)
def create_review_token(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Issue a new token, replacing any earlier one. The plain token is returned once."""
    token, token_hash = new_review_token()
    row = _token_row(user, session) or PrepReviewToken(user_id=user.id, token_hash=token_hash)
    row.token_hash = token_hash
    row.created_at = datetime.now(timezone.utc)
    row.last_used_at = None
    session.add(row)
    session.commit()
    session.refresh(row)
    return _token_out(row, token)


@router.delete("/review-token", status_code=204)
def delete_review_token(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    row = _token_row(user, session)
    if row:
        session.delete(row)
        session.commit()


@router.get("/log")
def get_daily_log(
    day: date = Query(alias="date"),
    session: Session = Depends(get_session),
    user: User = Depends(get_prep_user),
) -> dict:
    """The day's plan, attempts (with code), streak, redos and totals for the review."""
    settings = _settings(user, session)
    if not settings:
        raise HTTPException(409, "Set a start date first")
    tasks = list(session.exec(select(PrepTask)).all())
    attempts = list(
        session.exec(
            select(PrepAttempt).where(PrepAttempt.user_id == user.id, PrepAttempt.date <= day)
        ).all()
    )
    redos = list(session.exec(select(PrepRedo).where(PrepRedo.user_id == user.id)).all())
    return build_daily_log(program(), tasks, settings.start_date, day, attempts, redos)


@router.put("/feedback/{day}", response_model=PrepFeedbackOut)
async def put_feedback(
    day: date,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(get_prep_user),
):
    """Store the review's markdown (raw request body) for a day, replacing any earlier one."""
    markdown = (await request.body()).decode("utf-8", errors="replace").strip()
    if not markdown:
        raise HTTPException(422, "Feedback is empty")
    if len(markdown) > 50_000:
        raise HTTPException(413, "Feedback is too long")
    rows = session.exec(
        select(PrepFeedback).where(PrepFeedback.user_id == user.id, PrepFeedback.date == day)
    ).all()
    for row in rows:
        session.delete(row)
    feedback = PrepFeedback(user_id=user.id, date=day, markdown=markdown)
    session.add(feedback)
    session.commit()
    session.refresh(feedback)
    return PrepFeedbackOut(
        date=feedback.date, markdown=feedback.markdown, created_at=feedback.created_at
    )


@router.post("/tasks/{task_id}/hints", response_model=PrepHintsOut)
def reveal_hint(
    task_id: str,
    body: PrepHintRevealIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Reveal the next hint for today. Hints open in order and mark the day's attempt."""
    _require_near_today(body.date)
    task = session.get(PrepTask, task_id)
    if task is None or not task.hints:
        raise HTTPException(404, "No hints for this task")
    total = _hint_tiers(task)
    revealed = _revealed_hints(user, task_id, body.date, session)
    if len(revealed) < total:
        session.add(
            PrepHintReveal(
                user_id=user.id, task_id=task_id, date=body.date, level=len(revealed) + 1
            )
        )
        session.commit()
        revealed = _revealed_hints(user, task_id, body.date, session)
    return PrepHintsOut(
        total=total,
        revealed=task.hints[: len(revealed)],
        solution=task.solution if len(revealed) > len(task.hints) else None,
    )


def _owned_attempt(attempt_id: int, user: User, session: Session) -> PrepAttempt:
    attempt = session.get(PrepAttempt, attempt_id)
    if not attempt or attempt.user_id != user.id:
        raise HTTPException(404, "Attempt not found")
    return attempt


def _tutor_history(attempt_id: int, session: Session) -> list[PrepTutorMessage]:
    return list(
        session.exec(
            select(PrepTutorMessage)
            .where(PrepTutorMessage.attempt_id == attempt_id)
            .order_by(PrepTutorMessage.id)
        ).all()
    )


def _tutor_out(message: PrepTutorMessage) -> PrepTutorMessageOut:
    return PrepTutorMessageOut(
        id=message.id or 0,
        role=message.role,
        content=message.content,
        model_served=message.model_served,
        created_at=_utc(message.created_at) or message.created_at,
    )


@router.get("/attempts/{attempt_id}/tutor", response_model=list[PrepTutorMessageOut])
def get_tutor_thread(
    attempt_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _owned_attempt(attempt_id, user, session)
    return [_tutor_out(m) for m in _tutor_history(attempt_id, session)]


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


@router.post("/attempts/{attempt_id}/tutor/stream")
def stream_tutor(
    attempt_id: int,
    body: PrepTutorIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Stream the attempt review (empty message) or an answer to a follow-up question."""
    attempt = _owned_attempt(attempt_id, user, session)
    task = session.get(PrepTask, attempt.task_id)
    history = _tutor_history(attempt_id, session)
    hints_revealed = len(_revealed_hints(user, attempt.task_id, attempt.date, session))
    question = body.message.strip()
    if not question and history:
        raise HTTPException(409, "This attempt already has a review")
    if question and not history:
        raise HTTPException(409, "Ask for the review first")

    if question:
        messages = followup_messages(task, attempt, hints_revealed, history, question)
        session.add(
            PrepTutorMessage(
                user_id=user.id, attempt_id=attempt_id, role="user", content=question
            )
        )
        session.commit()
    else:
        messages = review_messages(task, attempt, hints_revealed)

    try:
        provider = build_coach_provider(body.model)
    except (RuntimeError, ValueError):
        provider = None
    user_id = user.id

    def save(content: str, model: str) -> dict:
        with Session(engine) as db:
            row = PrepTutorMessage(
                user_id=user_id,
                attempt_id=attempt_id,
                role="assistant",
                content=content,
                model_served=model,
            )
            db.add(row)
            db.commit()
            db.refresh(row)
            return _tutor_out(row).model_dump(mode="json")

    def events() -> Iterator[str]:
        if provider is None:
            text = OFFLINE_FOLLOWUP if question else offline_review(task, attempt)
            yield _sse({"type": "token", "content": text})
            yield _sse({"type": "done", "message": save(text, "offline")})
            return
        parts: list[str] = []
        try:
            for token in provider.chat_stream(messages, max_tokens=2048):
                parts.append(token)
                yield _sse({"type": "token", "content": token})
        except Exception as error:  # noqa: BLE001 - surface provider failures to the UI
            if not parts:
                yield _sse({"type": "error", "detail": f"The tutor is unavailable: {error}"})
                return
        text = "".join(parts).strip()
        if not text:
            yield _sse({"type": "error", "detail": "The tutor returned an empty reply"})
            return
        model = provider.last_model or provider.chat_model
        yield _sse({"type": "done", "message": save(text, model)})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
