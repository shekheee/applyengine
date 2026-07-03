from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.auth import get_current_user
from app.db import get_session
from app.models import ChatMessage, Memory, Profile, User
from app.schemas import ChatIn
from app.services import coach
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

    user_msg = ChatMessage(user_id=user.id, role="user", content=text)
    session.add(user_msg)

    reply = coach.coach_reply(text, profile, memories, history)
    assistant_msg = ChatMessage(user_id=user.id, role="assistant", content=reply)
    session.add(assistant_msg)

    # Learn durable facts from this exchange.
    new_memories = coach.extract_memories(text, reply, memories)
    for item in new_memories:
        session.add(
            Memory(user_id=user.id, kind=item["kind"], content=item["content"])
        )

    session.commit()
    session.refresh(assistant_msg)
    return assistant_msg


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
