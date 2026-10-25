"""Interview Prep: weakness insights, the AI mock interviewer and readiness checkpoints."""
from __future__ import annotations

import json
from collections.abc import Iterator
from datetime import date, datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from app.auth import get_current_user
from app.db import engine, get_session
from app.llm import build_coach_provider
from app.models import (
    PrepAttempt,
    PrepCheckpointRun,
    PrepMock,
    PrepMockSession,
    PrepMockTurn,
    PrepRedo,
    PrepSettings,
    PrepStory,
    PrepTask,
    User,
)
from app.schemas import (
    PrepCheckpointCompleteIn,
    PrepCheckpointStartIn,
    PrepMockFinishIn,
    PrepMockSessionIn,
    PrepMockSessionOut,
    PrepMockTurnIn,
    PrepMockTurnOut,
)
from app.services.prep_checkpoints import (
    BY_ID as CHECKPOINTS_BY_ID,
)
from app.services.prep_checkpoints import (
    CHECKPOINTS,
    computed_status,
    evaluate_run,
    pick_task,
    readiness,
)
from app.services.prep_insights import build_insights
from app.services.prep_mock_interview import (
    SIGNAL_SCORES,
    interviewer_messages,
    mock_kind,
    normalize_scorecard,
    offline_scorecard,
    opening_message,
    scorecard_messages,
)
from app.services.prep_schedule import program_week

router = APIRouter(prefix="/api/prep", tags=["prep"])

OFFLINE_INTERVIEWER = (
    "(The AI interviewer is not configured on this server.) Keep talking through your "
    "approach as if I were listening: state the complexity, the edge cases and how you "
    "would test it, then end the interview for a scorecard."
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _utc(moment: datetime | None) -> datetime | None:
    if moment is None or moment.tzinfo is not None:
        return moment
    return moment.replace(tzinfo=timezone.utc)


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _week(user: User, session: Session, day: date) -> int:
    settings = session.exec(select(PrepSettings).where(PrepSettings.user_id == user.id)).first()
    return program_week(settings.start_date, day) if settings else 0


def _attempts(user: User, session: Session, day: date | None = None) -> list[PrepAttempt]:
    query = select(PrepAttempt).where(PrepAttempt.user_id == user.id)
    if day is not None:
        query = query.where(PrepAttempt.date <= day)
    return list(session.exec(query).all())


# ---- Insights ------------------------------------------------------------


@router.get("/insights")
def get_insights(
    day: date = Query(alias="date"),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    tasks = list(session.exec(select(PrepTask)).all())
    redos = list(session.exec(select(PrepRedo).where(PrepRedo.user_id == user.id)).all())
    return build_insights(tasks, _attempts(user, session, day), redos, day)


# ---- Mock interviews -----------------------------------------------------


def _owned_mock(session_id: int, user: User, session: Session) -> PrepMockSession:
    row = session.get(PrepMockSession, session_id)
    if not row or row.user_id != user.id:
        raise HTTPException(404, "Mock interview not found")
    return row


def _turns(session_id: int, session: Session) -> list[PrepMockTurn]:
    return list(
        session.exec(
            select(PrepMockTurn).where(PrepMockTurn.session_id == session_id).order_by(PrepMockTurn.id)
        ).all()
    )


def _turn_out(turn: PrepMockTurn) -> PrepMockTurnOut:
    return PrepMockTurnOut(
        id=turn.id or 0,
        role=turn.role,
        content=turn.content,
        created_at=_utc(turn.created_at) or turn.created_at,
    )


def _mock_out(row: PrepMockSession, session: Session) -> PrepMockSessionOut:
    return PrepMockSessionOut(
        id=row.id or 0,
        task_id=row.task_id,
        date=row.date,
        status=row.status,
        started_at=_utc(row.started_at) or row.started_at,
        ended_at=_utc(row.ended_at),
        elapsed_minutes=row.elapsed_minutes,
        code=row.code,
        scorecard=row.scorecard,
        checkpoint_run_id=row.checkpoint_run_id,
        mock_log_id=row.mock_log_id,
        turns=[_turn_out(t) for t in _turns(row.id or 0, session)],
    )


def _provider(model: str | None):
    try:
        return build_coach_provider(model)
    except (RuntimeError, ValueError):
        return None


@router.post("/mock-sessions", response_model=PrepMockSessionOut)
def start_mock(
    body: PrepMockSessionIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    task = session.get(PrepTask, body.task_id)
    if task is None:
        raise HTTPException(404, "Task not found")
    if body.checkpoint_run_id is not None:
        run = _owned_run(body.checkpoint_run_id, user, session)
        if run.task_id != task.id or run.finished_at is not None:
            raise HTTPException(409, "That checkpoint run does not match this task")
    row = PrepMockSession(
        user_id=user.id, task_id=task.id, date=body.date, checkpoint_run_id=body.checkpoint_run_id
    )
    session.add(row)
    session.flush()
    session.add(PrepMockTurn(session_id=row.id, role="interviewer", content=opening_message(task)))
    session.commit()
    session.refresh(row)
    return _mock_out(row, session)


@router.get("/mock-sessions", response_model=list[PrepMockSessionOut])
def list_mocks(
    task_id: str | None = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    query = select(PrepMockSession).where(PrepMockSession.user_id == user.id)
    if task_id:
        query = query.where(PrepMockSession.task_id == task_id)
    rows = session.exec(query.order_by(PrepMockSession.id.desc())).all()  # type: ignore[union-attr]
    return [_mock_out(r, session) for r in rows[:20]]


@router.get("/mock-sessions/{session_id}", response_model=PrepMockSessionOut)
def get_mock(
    session_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    return _mock_out(_owned_mock(session_id, user, session), session)


@router.post("/mock-sessions/{session_id}/turn/stream")
def stream_mock_turn(
    session_id: int,
    body: PrepMockTurnIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Save the candidate's message and stream the interviewer's reply."""
    row = _owned_mock(session_id, user, session)
    if row.status != "active":
        raise HTTPException(409, "This interview has ended")
    task = session.get(PrepTask, row.task_id)
    if task is None:
        raise HTTPException(404, "Task not found")
    candidate = PrepMockTurn(session_id=session_id, role="candidate", content=body.message.strip())
    session.add(candidate)
    row.code = body.code
    row.elapsed_minutes = round(body.elapsed_minutes, 2)
    session.add(row)
    session.commit()
    session.refresh(candidate)
    messages = interviewer_messages(
        task, row, _turns(session_id, session), body.code, body.elapsed_minutes
    )
    provider = _provider(body.model)
    candidate_out = _turn_out(candidate).model_dump(mode="json")

    def save(content: str) -> dict:
        with Session(engine) as db:
            turn = PrepMockTurn(session_id=session_id, role="interviewer", content=content)
            db.add(turn)
            db.commit()
            db.refresh(turn)
            return _turn_out(turn).model_dump(mode="json")

    def events() -> Iterator[str]:
        yield _sse({"type": "candidate", "message": candidate_out})
        if provider is None:
            yield _sse({"type": "token", "content": OFFLINE_INTERVIEWER})
            yield _sse({"type": "done", "message": save(OFFLINE_INTERVIEWER)})
            return
        parts: list[str] = []
        try:
            for token in provider.chat_stream(messages, max_tokens=1024):
                parts.append(token)
                yield _sse({"type": "token", "content": token})
        except Exception as error:  # noqa: BLE001 - surface provider failures to the UI
            if not parts:
                yield _sse({"type": "error", "detail": f"The interviewer is unavailable: {error}"})
                return
        text = "".join(parts).strip()
        if not text:
            yield _sse({"type": "error", "detail": "The interviewer returned an empty reply"})
            return
        yield _sse({"type": "done", "message": save(text)})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _parse_json(text: str) -> dict[str, Any] | None:
    text = text.strip()
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        value = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


@router.post("/mock-sessions/{session_id}/finish", response_model=PrepMockSessionOut)
def finish_mock(
    session_id: int,
    body: PrepMockFinishIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """End the interview: write the scorecard, log it as a mock, grade any checkpoint."""
    row = _owned_mock(session_id, user, session)
    if row.status == "finished":
        return _mock_out(row, session)
    task = session.get(PrepTask, row.task_id)
    if task is None:
        raise HTTPException(404, "Task not found")
    turns = _turns(session_id, session)
    card = None
    provider = _provider(body.model)
    if provider is not None:
        try:
            raw = provider.chat_messages(
                scorecard_messages(task, turns, body.code, body.elapsed_minutes), json_mode=True
            )
            card = normalize_scorecard(_parse_json(raw))
        except Exception:  # noqa: BLE001 - fall back to the placeholder scorecard
            card = None
    if card is None:
        card = offline_scorecard(turns, body.code)

    row.status = "finished"
    row.ended_at = _now()
    row.code = body.code
    row.elapsed_minutes = round(body.elapsed_minutes, 2)
    row.scorecard = card
    log = PrepMock(
        user_id=user.id,
        date=row.date,
        kind=mock_kind(task),
        platform="AI interviewer",
        company="",
        duration_minutes=max(1, round(body.elapsed_minutes)),
        score=card.get("score", SIGNAL_SCORES["lean_no"]),
        went_well="\n".join(f"- {s}" for s in card.get("strengths", [])),
        to_improve="\n".join(f"- {s}" for s in card.get("improvements", [])),
    )
    if not card.get("offline"):
        session.add(log)
        session.flush()
        row.mock_log_id = log.id
    session.add(row)

    if row.checkpoint_run_id is not None:
        run = session.get(PrepCheckpointRun, row.checkpoint_run_id)
        if run and run.user_id == user.id and run.finished_at is None:
            _grade(run, None, row, body.elapsed_minutes, None, None, None)
            session.add(run)
    session.commit()
    session.refresh(row)
    return _mock_out(row, session)


# ---- Checkpoints ---------------------------------------------------------


def _owned_run(run_id: int, user: User, session: Session) -> PrepCheckpointRun:
    run = session.get(PrepCheckpointRun, run_id)
    if not run or run.user_id != user.id:
        raise HTTPException(404, "Checkpoint run not found")
    return run


def _run_out(run: PrepCheckpointRun, session: Session) -> dict[str, Any]:
    checkpoint = CHECKPOINTS_BY_ID.get(run.checkpoint_id, {})
    task = session.get(PrepTask, run.task_id) if run.task_id else None
    return {
        "id": run.id,
        "checkpoint_id": run.checkpoint_id,
        "title": checkpoint.get("title", run.checkpoint_id),
        "criteria": checkpoint.get("criteria", ""),
        "rule": checkpoint.get("rule"),
        "limit": checkpoint.get("limit"),
        "task_id": run.task_id,
        "task_title": task.title if task else None,
        "task_type": task.type if task else None,
        "date": run.date.isoformat(),
        "started_at": _utc(run.started_at).isoformat() if run.started_at else None,
        "finished_at": _utc(run.finished_at).isoformat() if run.finished_at else None,
        "passed": run.passed,
        "details": run.details or {},
    }


def _grade(
    run: PrepCheckpointRun,
    attempt: PrepAttempt | None,
    mock: PrepMockSession | None,
    elapsed_minutes: float,
    tests_passed: int | None,
    tests_total: int | None,
    levels_passed: int | None,
) -> None:
    checkpoint = CHECKPOINTS_BY_ID[run.checkpoint_id]
    passed, reasons = evaluate_run(
        checkpoint, attempt, mock, elapsed_minutes, tests_passed, tests_total, levels_passed
    )
    run.passed = passed
    run.finished_at = _now()
    run.details = {
        **(run.details or {}),
        "reasons": reasons,
        "elapsed_minutes": round(attempt.elapsed_minutes if attempt else elapsed_minutes, 1),
        "attempt_id": attempt.id if attempt else None,
        "mock_session_id": mock.id if mock else None,
        "signal": (mock.scorecard or {}).get("signal") if mock else None,
        "tests_passed": tests_passed,
        "tests_total": tests_total,
        "levels_passed": levels_passed,
    }


@router.get("/checkpoints")
def list_checkpoints(
    day: date = Query(alias="date"),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    week = _week(user, session, day)
    runs = list(
        session.exec(
            select(PrepCheckpointRun)
            .where(PrepCheckpointRun.user_id == user.id)
            .order_by(PrepCheckpointRun.id)
        ).all()
    )
    stories = list(session.exec(select(PrepStory).where(PrepStory.user_id == user.id)).all())
    mocks = list(session.exec(select(PrepMock).where(PrepMock.user_id == user.id)).all())
    statuses = []
    for checkpoint in CHECKPOINTS:
        mine = [r for r in runs if r.checkpoint_id == checkpoint["id"]]
        progress = ""
        if checkpoint["rule"] == "computed":
            done, progress = computed_status(checkpoint["id"], stories, mocks)
            status = "passed" if done else ("open" if week >= checkpoint["week"] else "upcoming")
        elif any(r.passed for r in mine):
            status = "passed"
        elif any(r.finished_at is None for r in mine):
            status = "in_progress"
        elif mine:
            status = "attempted"
        else:
            status = "open" if week >= checkpoint["week"] else "upcoming"
        statuses.append(
            {
                "id": checkpoint["id"],
                "week": checkpoint["week"],
                "tracks": checkpoint["tracks"],
                "title": checkpoint["title"],
                "criteria": checkpoint["criteria"],
                "rule": checkpoint["rule"],
                "limit": checkpoint.get("limit"),
                "status": status,
                "progress": progress,
                "runs": [_run_out(r, session) for r in reversed(mine[-5:])],
            }
        )
    return {"week": week, "checkpoints": statuses, "readiness": readiness(statuses)}


@router.post("/checkpoints/{checkpoint_id}/start")
def start_checkpoint(
    checkpoint_id: str,
    body: PrepCheckpointStartIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    checkpoint = CHECKPOINTS_BY_ID.get(checkpoint_id)
    if checkpoint is None:
        raise HTTPException(404, "Checkpoint not found")
    if checkpoint["rule"] == "computed":
        raise HTTPException(409, "This checkpoint is tracked from your story bank and mock log")
    # An unfinished run is resumed rather than duplicated.
    open_run = session.exec(
        select(PrepCheckpointRun).where(
            PrepCheckpointRun.user_id == user.id,
            PrepCheckpointRun.checkpoint_id == checkpoint_id,
            PrepCheckpointRun.finished_at == None,  # noqa: E711
        )
    ).first()
    if open_run:
        return _run_out(open_run, session)
    tasks = list(session.exec(select(PrepTask)).all())
    task = pick_task(checkpoint, tasks, _attempts(user, session), _week(user, session, body.date))
    if task is None:
        raise HTTPException(409, "No task is available for this checkpoint")
    run = PrepCheckpointRun(
        user_id=user.id, checkpoint_id=checkpoint_id, task_id=task.id, date=body.date, details={}
    )
    session.add(run)
    session.commit()
    session.refresh(run)
    return _run_out(run, session)


@router.get("/checkpoints/runs/{run_id}")
def get_checkpoint_run(
    run_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    return _run_out(_owned_run(run_id, user, session), session)


@router.post("/checkpoints/runs/{run_id}/complete")
def complete_checkpoint_run(
    run_id: int,
    body: PrepCheckpointCompleteIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    run = _owned_run(run_id, user, session)
    if run.finished_at is not None:
        return _run_out(run, session)
    attempt = None
    if body.attempt_id is not None:
        attempt = session.get(PrepAttempt, body.attempt_id)
        if not attempt or attempt.user_id != user.id or attempt.task_id != run.task_id:
            raise HTTPException(422, "That attempt is not for this checkpoint's task")
    mock = None
    if body.mock_session_id is not None:
        mock = _owned_mock(body.mock_session_id, user, session)
        if mock.task_id != run.task_id:
            raise HTTPException(422, "That interview is not for this checkpoint's task")
    _grade(
        run,
        attempt,
        mock,
        body.elapsed_minutes,
        body.tests_passed,
        body.tests_total,
        body.levels_passed,
    )
    session.add(run)
    session.commit()
    session.refresh(run)
    return _run_out(run, session)
