from __future__ import annotations

from datetime import datetime, timezone

from sqlmodel import Session, select

from app.models import ChatMessage, Conversation, Job, User


def owned_conversation(
    conversation_id: int, user: User, session: Session
) -> Conversation:
    conv = session.get(Conversation, conversation_id)
    if not conv or conv.user_id != user.id:
        raise ValueError("Conversation not found")
    return conv


def conversation_messages(
    conversation_id: int, user: User, session: Session
) -> list[ChatMessage]:
    return session.exec(
        select(ChatMessage)
        .where(
            ChatMessage.user_id == user.id,
            ChatMessage.conversation_id == conversation_id,
        )
        .order_by(ChatMessage.id.asc())
    ).all()


def list_user_conversations(user: User, session: Session) -> list[Conversation]:
    return session.exec(
        select(Conversation)
        .where(Conversation.user_id == user.id)
        .order_by(Conversation.updated_at.desc())
    ).all()


def get_or_create_general(user: User, session: Session) -> Conversation:
    general = session.exec(
        select(Conversation).where(
            Conversation.user_id == user.id,
            Conversation.title == "General",
        )
    ).first()
    if general:
        return general
    general = Conversation(user_id=user.id, title="General")
    session.add(general)
    session.commit()
    session.refresh(general)
    return general


def conversation_job(session: Session, conv: Conversation) -> Job | None:
    if not conv.job_id:
        return None
    return session.get(Job, conv.job_id)


def conversation_jd_block(conv: Conversation, job: Job | None) -> str:
    """JD text injected into Coach system context for this thread."""
    if job:
        from app.services.serialize import job_to_text

        return job_to_text(job)
    if conv.jd_text.strip():
        return conv.jd_text.strip()
    return ""


def suggest_title(
    conv: Conversation, job: Job | None, first_message: str = ""
) -> str:
    if job and job.title and job.company:
        return f"{job.title} @ {job.company}"
    if job and (job.title or job.company):
        return job.title or job.company or "Interview prep"
    if conv.jd_text.strip():
        first_line = conv.jd_text.strip().split("\n")[0].strip()
        if first_line:
            return first_line[:60] + ("…" if len(first_line) > 60 else "")
    if first_message.strip():
        t = first_message.strip().replace("\n", " ")
        return t[:60] + ("…" if len(t) > 60 else "")
    return "New conversation"


def maybe_auto_title(
    conv: Conversation,
    job: Job | None,
    first_message: str,
) -> None:
    if conv.title not in ("New conversation", "General", ""):
        return
    conv.title = suggest_title(conv, job, first_message)


def touch_conversation(conv: Conversation) -> None:
    conv.updated_at = datetime.now(timezone.utc)


def message_preview(messages: list[ChatMessage]) -> str:
    for msg in reversed(messages):
        if msg.content.strip():
            t = msg.content.strip().replace("\n", " ")
            return t[:80] + ("…" if len(t) > 80 else "")
    return ""


def build_conversation_out(
    conv: Conversation,
    session: Session,
    messages: list[ChatMessage] | None = None,
) -> dict:
    job = conversation_job(session, conv)
    if messages is None:
        messages = session.exec(
            select(ChatMessage)
            .where(ChatMessage.conversation_id == conv.id)
            .order_by(ChatMessage.id.asc())
        ).all()
    return {
        "id": conv.id,
        "title": conv.title,
        "job_id": conv.job_id,
        "job_title": job.title if job else "",
        "job_company": job.company if job else "",
        "has_jd": bool(conv.jd_text.strip() or conv.job_id),
        "jd_preview": (conv.jd_text.strip()[:120] + "…")
        if len(conv.jd_text.strip()) > 120
        else conv.jd_text.strip(),
        "message_preview": message_preview(messages),
        "message_count": len(messages),
        "created_at": conv.created_at.isoformat() if conv.created_at else "",
        "updated_at": conv.updated_at.isoformat() if conv.updated_at else "",
    }
