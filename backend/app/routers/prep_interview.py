"""Interview Prep: behavioural story bank, target companies and the mock interview log."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, SQLModel, select

from app.auth import get_current_user
from app.db import get_session
from app.llm import build_coach_provider
from app.models import PrepMock, PrepStory, PrepTarget, User
from app.schemas import (
    PrepMockIn,
    PrepMockOut,
    PrepStoryIn,
    PrepStoryOut,
    PrepTargetIn,
    PrepTargetOut,
)
from app.services.prep_stories import critique_messages, rule_based_critique

router = APIRouter(prefix="/api/prep", tags=["prep"])


def _owned(model: type[SQLModel], item_id: int, user: User, session: Session):
    row = session.get(model, item_id)
    if not row or row.user_id != user.id:
        raise HTTPException(404, "Not found")
    return row


def _story_out(story: PrepStory) -> PrepStoryOut:
    return PrepStoryOut.model_validate(story, from_attributes=True)


# ---- Stories -------------------------------------------------------------


@router.get("/stories", response_model=list[PrepStoryOut])
def list_stories(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    rows = session.exec(
        select(PrepStory).where(PrepStory.user_id == user.id).order_by(PrepStory.updated_at.desc())  # type: ignore[attr-defined]
    ).all()
    return [_story_out(r) for r in rows]


@router.post("/stories", response_model=PrepStoryOut)
def create_story(
    body: PrepStoryIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    story = PrepStory(user_id=user.id, **body.model_dump())
    session.add(story)
    session.commit()
    session.refresh(story)
    return _story_out(story)


@router.put("/stories/{story_id}", response_model=PrepStoryOut)
def update_story(
    story_id: int,
    body: PrepStoryIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    story = _owned(PrepStory, story_id, user, session)
    for field, value in body.model_dump().items():
        setattr(story, field, value)
    story.updated_at = datetime.now(timezone.utc)
    session.add(story)
    session.commit()
    session.refresh(story)
    return _story_out(story)


@router.delete("/stories/{story_id}", status_code=204)
def delete_story(
    story_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    session.delete(_owned(PrepStory, story_id, user, session))
    session.commit()


@router.post("/stories/{story_id}/critique", response_model=PrepStoryOut)
def critique_story(
    story_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Review the story (AI when configured, rule-based otherwise) and save the critique."""
    story = _owned(PrepStory, story_id, user, session)
    try:
        provider = build_coach_provider(None)
        text = provider.chat_messages(critique_messages(story), max_tokens=1200).strip()
    except Exception:  # noqa: BLE001 - no key or provider failure: fall back to rules
        text = ""
    story.critique = text or rule_based_critique(story)
    session.add(story)
    session.commit()
    session.refresh(story)
    return _story_out(story)


# ---- Target companies ----------------------------------------------------


@router.get("/targets", response_model=list[PrepTargetOut])
def list_targets(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    rows = session.exec(
        select(PrepTarget).where(PrepTarget.user_id == user.id).order_by(PrepTarget.company)
    ).all()
    return [PrepTargetOut.model_validate(r, from_attributes=True) for r in rows]


@router.post("/targets", response_model=PrepTargetOut)
def create_target(
    body: PrepTargetIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    target = PrepTarget(user_id=user.id, **body.model_dump())
    session.add(target)
    session.commit()
    session.refresh(target)
    return PrepTargetOut.model_validate(target, from_attributes=True)


@router.put("/targets/{target_id}", response_model=PrepTargetOut)
def update_target(
    target_id: int,
    body: PrepTargetIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    target = _owned(PrepTarget, target_id, user, session)
    for field, value in body.model_dump().items():
        setattr(target, field, value)
    target.updated_at = datetime.now(timezone.utc)
    session.add(target)
    session.commit()
    session.refresh(target)
    return PrepTargetOut.model_validate(target, from_attributes=True)


@router.delete("/targets/{target_id}", status_code=204)
def delete_target(
    target_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    session.delete(_owned(PrepTarget, target_id, user, session))
    session.commit()


# ---- Mock interviews -----------------------------------------------------


@router.get("/mocks", response_model=list[PrepMockOut])
def list_mocks(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    rows = session.exec(
        select(PrepMock)
        .where(PrepMock.user_id == user.id)
        .order_by(PrepMock.date.desc(), PrepMock.id.desc())  # type: ignore[attr-defined]
    ).all()
    return [PrepMockOut.model_validate(r, from_attributes=True) for r in rows]


@router.post("/mocks", response_model=PrepMockOut)
def create_mock(
    body: PrepMockIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    mock = PrepMock(user_id=user.id, **body.model_dump())
    session.add(mock)
    session.commit()
    session.refresh(mock)
    return PrepMockOut.model_validate(mock, from_attributes=True)


@router.put("/mocks/{mock_id}", response_model=PrepMockOut)
def update_mock(
    mock_id: int,
    body: PrepMockIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    mock = _owned(PrepMock, mock_id, user, session)
    for field, value in body.model_dump().items():
        setattr(mock, field, value)
    session.add(mock)
    session.commit()
    session.refresh(mock)
    return PrepMockOut.model_validate(mock, from_attributes=True)


@router.delete("/mocks/{mock_id}", status_code=204)
def delete_mock(
    mock_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    session.delete(_owned(PrepMock, mock_id, user, session))
    session.commit()
