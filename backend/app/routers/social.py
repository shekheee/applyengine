from __future__ import annotations

import json
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from app.auth import get_current_user
from app.db import engine, get_session
from app.llm.coach_models import validate_coach_model
from app.models import Profile, SocialMessage, SocialProject, User
from app.schemas import (
    SocialMessageIn,
    SocialMessageOut,
    SocialProjectCreate,
    SocialProjectOut,
    SocialProjectUpdate,
)
from app.services import social
from app.services.profiles import get_base_profile

router = APIRouter(prefix="/api/social", tags=["social"])
PLATFORMS = {"linkedin", "medium"}
STATUSES = {"draft", "ready", "archived"}


def _owned_project(project_id: int, user: User, session: Session) -> SocialProject:
    project = session.get(SocialProject, project_id)
    if not project or project.user_id != user.id:
        raise HTTPException(404, "Social project not found")
    return project


def _messages(project_id: int, user: User, session: Session) -> list[SocialMessage]:
    return list(
        session.exec(
            select(SocialMessage)
            .where(
                SocialMessage.project_id == project_id,
                SocialMessage.user_id == user.id,
            )
            .order_by(SocialMessage.id.asc())
        ).all()
    )


def _profile_snapshot(profile: Profile) -> SimpleNamespace:
    return SimpleNamespace(
        name=profile.name,
        email=profile.email,
        phone=profile.phone,
        location=profile.location,
        summary=profile.summary,
        raw_text=profile.raw_text,
        links=list(profile.links or []),
        skills=list(profile.skills or []),
        experience=list(profile.experience or []),
        projects=list(profile.projects or []),
        education=list(profile.education or []),
    )


def _project_snapshot(project: SocialProject) -> SimpleNamespace:
    return SimpleNamespace(
        id=project.id,
        platform=project.platform,
        title=project.title,
        status=project.status,
        settings=dict(project.settings or {}),
        current_content=project.current_content,
    )


@router.get("/projects", response_model=list[SocialProjectOut])
def list_projects(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    return session.exec(
        select(SocialProject)
        .where(SocialProject.user_id == user.id)
        .order_by(SocialProject.updated_at.desc())
    ).all()


@router.post("/projects", response_model=SocialProjectOut)
def create_project(
    body: SocialProjectCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    platform = body.platform.strip().lower()
    if platform not in PLATFORMS:
        raise HTTPException(422, "Platform must be linkedin or medium")
    title = body.title.strip()[:160] or (
        "New LinkedIn draft" if platform == "linkedin" else "New Medium article"
    )
    project = SocialProject(
        user_id=user.id,
        platform=platform,
        title=title,
        settings=body.settings,
    )
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


@router.get("/projects/{project_id}", response_model=SocialProjectOut)
def get_project(
    project_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    return _owned_project(project_id, user, session)


@router.patch("/projects/{project_id}", response_model=SocialProjectOut)
def update_project(
    project_id: int,
    body: SocialProjectUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    project = _owned_project(project_id, user, session)
    if body.title is not None:
        title = body.title.strip()[:160]
        if not title:
            raise HTTPException(400, "Title cannot be empty")
        project.title = title
    if body.status is not None:
        status = body.status.strip().lower()
        if status not in STATUSES:
            raise HTTPException(422, "Status must be draft, ready, or archived")
        project.status = status
    if body.settings is not None:
        project.settings = body.settings
    if body.current_content is not None:
        project.current_content = body.current_content
    project.updated_at = datetime.now(timezone.utc)
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


@router.delete("/projects/{project_id}")
def delete_project(
    project_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    project = _owned_project(project_id, user, session)
    for message in _messages(project_id, user, session):
        session.delete(message)
    session.delete(project)
    session.commit()
    return {"ok": True}


@router.get(
    "/projects/{project_id}/messages", response_model=list[SocialMessageOut]
)
def list_messages(
    project_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _owned_project(project_id, user, session)
    return _messages(project_id, user, session)


@router.post("/projects/{project_id}/messages/stream")
async def send_message_stream(
    project_id: int,
    body: SocialMessageIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    text = body.message.strip()
    if not text:
        raise HTTPException(400, "Message is empty")
    if len(text) > 20_000:
        raise HTTPException(422, "Message is too long")
    try:
        model_id = validate_coach_model(body.model)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc

    project = _owned_project(project_id, user, session)
    profile = get_base_profile(user, session)
    if not profile:
        raise HTTPException(
            400,
            "Upload a base resume before generating social content so drafts can "
            "be grounded in verified experience.",
        )
    history = _messages(project_id, user, session)
    user_message = SocialMessage(
        user_id=user.id, project_id=project_id, role="user", content=text
    )
    project.updated_at = datetime.now(timezone.utc)
    session.add(user_message)
    session.add(project)
    session.commit()
    session.refresh(user_message)

    profile_snap = _profile_snapshot(profile)
    project_snap = _project_snapshot(project)
    history_snap = [
        SimpleNamespace(role=item.role, content=item.content) for item in history
    ]
    user_id = user.id
    user_json = user_message.model_dump(mode="json")

    async def event_stream() -> AsyncIterator[str]:
        content = ""
        served: dict[str, str | None] = {}
        try:
            async for token in social.social_reply_stream(
                text,
                profile_snap,
                project_snap,
                history_snap,
                model_id=model_id,
                served=served,
            ):
                content += token
                yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
            content = content.strip()
            if not content:
                raise RuntimeError("The selected models returned an empty draft")
            with Session(engine) as db:
                saved_project = db.get(SocialProject, project_id)
                if not saved_project or saved_project.user_id != user_id:
                    raise RuntimeError("Social project no longer exists")
                assistant = SocialMessage(
                    user_id=user_id,
                    project_id=project_id,
                    role="assistant",
                    content=content,
                )
                saved_project.current_content = content
                saved_project.updated_at = datetime.now(timezone.utc)
                db.add(assistant)
                db.add(saved_project)
                db.commit()
                db.refresh(assistant)
                db.refresh(saved_project)
                assistant_json = assistant.model_dump(mode="json")
                project_json = saved_project.model_dump(mode="json")
            yield (
                "data: "
                + json.dumps(
                    {
                        "type": "done",
                        "user_message": user_json,
                        "assistant_message": assistant_json,
                        "project": project_json,
                        "provider_served": served.get("provider"),
                        "model_served": served.get("model"),
                    }
                )
                + "\n\n"
            )
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'detail': str(exc)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/publishing-status")
def publishing_status():
    return {
        "linkedin": {
            "connected": False,
            "direct_publishing": False,
            "handoff_url": "https://www.linkedin.com/feed/?shareActive=true",
        },
        "medium": {
            "connected": False,
            "direct_publishing": False,
            "handoff_url": "https://medium.com/new-story",
        },
        "note": (
            "Direct publishing is not configured. Drafts stay in ApplyEngine until "
            "you copy or download them and finish publishing on the platform."
        ),
    }
