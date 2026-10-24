from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from app.auth import get_current_user
from app.db import get_session
from app.models import PrepAttempt, PrepFeedback, PrepRedo, PrepSettings, PrepTask, User
from app.schemas import (
    PrepCheckIn,
    PrepFeedbackOut,
    PrepSettingsIn,
    PrepSettingsOut,
    PrepTodayOut,
)
from app.services.prep_schedule import build_today, neetcode_task_id
from app.services.prep_seed import program

router = APIRouter(prefix="/api/prep", tags=["prep"])

CHECKLIST_NOTE = "Ticked from the Today checklist."


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

