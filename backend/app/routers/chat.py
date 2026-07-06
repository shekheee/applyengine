from __future__ import annotations

import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from app.auth import get_current_user
from app.db import get_session
from app.models import Application, ChatMessage, Job, Memory, Profile, User
from app.schemas import ChatIn
from app.services import coach
from app.services.attachments import MAX_ATTACHMENTS, process_attachment
from app.services.parsing import parse_resume

router = APIRouter(prefix="/api/chat", tags=["chat"])


def _latest_profile(user: User, session: Session) -> Profile | None:
    return session.exec(
        select(Profile).where(Profile.user_id == user.id).order_by(Profile.id.desc())
    ).first()


def _user_memories(user: User, session: Session) -> list[Memory]:
    return session.exec(
        select(Memory).where(Memory.user_id == user.id).order_by(Memory.id.asc())
    ).all()


def _user_messages(user: User, session: Session) -> list[ChatMessage]:
    return session.exec(
        select(ChatMessage)
        .where(ChatMessage.user_id == user.id)
        .order_by(ChatMessage.id.asc())
    ).all()


def _user_applications(user: User, session: Session) -> list[Application]:
    return session.exec(
        select(Application)
        .where(Application.user_id == user.id)
        .order_by(Application.id.desc())
    ).all()


def _jobs_for_apps(session: Session, apps: list[Application]) -> dict[int, Job]:
    job_ids = {a.job_id for a in apps}
    if not job_ids:
        return {}
    jobs = session.exec(select(Job).where(Job.id.in_(job_ids))).all()
    return {j.id: j for j in jobs if j.id is not None}


@router.get("/messages", response_model=list[ChatMessage])
def list_messages(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    return _user_messages(user, session)


@router.get("/memories", response_model=list[Memory])
def list_memories(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    return _user_memories(user, session)


@router.delete("/memories/{memory_id}")
def delete_memory(
    memory_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    m = session.get(Memory, memory_id)
    if not m or m.user_id != user.id:
        raise HTTPException(404, "Memory not found")
    session.delete(m)
    session.commit()
    return {"ok": True}


def _process_uploads(files: list[UploadFile]):
    if len(files) > MAX_ATTACHMENTS:
        raise HTTPException(400, f"Maximum {MAX_ATTACHMENTS} attachments per message.")
    processed = []
    meta = []
    for f in files:
        if not f.filename:
            continue
        data = f.file.read()
        try:
            att = process_attachment(f.filename, data)
        except ValueError as e:
            raise HTTPException(400, str(e)) from e
        processed.append(att)
        meta.append(att.meta)
    return processed, meta


@router.post("/messages", response_model=ChatMessage)
def send_message(
    body: ChatIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    text = body.message.strip()
    if not text:
        raise HTTPException(400, "Message is empty")

    history = _user_messages(user, session)
    profile = _latest_profile(user, session)
    memories = _user_memories(user, session)
    apps = _user_applications(user, session)
    jobs = _jobs_for_apps(session, apps)

    user_msg = ChatMessage(user_id=user.id, role="user", content=text)
    session.add(user_msg)

    reply = coach.coach_reply(text, profile, memories, history, None, apps, jobs)
    assistant_msg = ChatMessage(user_id=user.id, role="assistant", content=reply)
    session.add(assistant_msg)

    new_memories = coach.extract_memories(text, reply, memories)
    for item in new_memories:
        session.add(
            Memory(user_id=user.id, kind=item["kind"], content=item["content"])
        )

    session.commit()
    session.refresh(assistant_msg)
    return assistant_msg


@router.post("/messages/stream")
async def send_message_stream(
    message: str = Form(""),
    files: list[UploadFile] = File(default=[]),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    text = message.strip()
    if not text and not files:
        raise HTTPException(400, "Message or attachment is required")

    processed, att_meta = _process_uploads(files)

    history = _user_messages(user, session)
    profile = _latest_profile(user, session)
    memories = _user_memories(user, session)
    apps = _user_applications(user, session)
    jobs = _jobs_for_apps(session, apps)

    user_msg = ChatMessage(
        user_id=user.id,
        role="user",
        content=text or "(attachment)",
        attachments=att_meta,
    )
    session.add(user_msg)
    session.commit()
    session.refresh(user_msg)

    async def event_stream() -> AsyncIterator[str]:
        accumulated = ""
        try:
            async for token in coach.coach_reply_stream_async(
                text or "Please review the attached file(s).",
                profile,
                memories,
                history,
                processed or None,
                apps,
                jobs,
            ):
                accumulated += token
                yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

            reply = accumulated.strip() or coach.coach_reply(
                text, profile, memories, history, processed or None, apps, jobs
            )

            assistant_msg = ChatMessage(
                user_id=user.id, role="assistant", content=reply
            )
            session.add(assistant_msg)

            new_memories = coach.extract_memories(
                text or "(attachment)", reply, memories
            )
            for item in new_memories:
                session.add(
                    Memory(user_id=user.id, kind=item["kind"], content=item["content"])
                )

            session.commit()
            session.refresh(assistant_msg)

            yield f"data: {json.dumps({'type': 'done', 'user_message': user_msg.model_dump(mode='json'), 'assistant_message': assistant_msg.model_dump(mode='json')})}\n\n"
        except Exception as e:
            session.rollback()
            yield f"data: {json.dumps({'type': 'error', 'detail': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/apply-to-resume", response_model=Profile)
def apply_to_resume(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Fold everything the coach has learned into a fresh, improved profile."""
    profile = _latest_profile(user, session)
    memories = _user_memories(user, session)
    if not memories and not profile:
        raise HTTPException(
            400, "Nothing to update yet — chat with the coach or add a resume first."
        )

    updated_text = coach.build_updated_resume_text(profile, memories)
    parsed = parse_resume(updated_text)
    new_profile = Profile(
        user_id=user.id,
        name=parsed.get("name", "") or (profile.name if profile else ""),
        email=parsed.get("email", "") or (profile.email if profile else ""),
        phone=parsed.get("phone", "") or (profile.phone if profile else ""),
        location=parsed.get("location", "") or (profile.location if profile else ""),
        summary=parsed.get("summary", ""),
        raw_text=parsed.get("raw_text", updated_text),
        links=parsed.get("links", []),
        skills=parsed.get("skills", []),
        experience=parsed.get("experience", []),
        projects=parsed.get("projects", []),
        education=parsed.get("education", []),
    )
    session.add(new_profile)
    session.commit()
    session.refresh(new_profile)
    return new_profile
