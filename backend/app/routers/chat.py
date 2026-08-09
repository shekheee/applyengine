from __future__ import annotations

import json
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from app.auth import get_current_user
from app.db import engine, get_session
from app.models import Application, ChatMessage, Conversation, Job, Memory, Profile, User
from app.llm.coach_models import validate_coach_model
from app.llm.factory import list_coach_models, default_model_id
from app.services.web_research import normalize_search_mode, should_search
from app.schemas import (
    ChatEditIn,
    ChatIn,
    CoachModelsOut,
    CoachModelOut,
    ConversationCreate,
    ConversationOut,
    ConversationRenameIn,
)
from app.services import coach
from app.services.attachments import MAX_ATTACHMENTS, process_attachment
from app.services.conversations import (
    build_conversation_out,
    conversation_jd_block,
    conversation_job,
    conversation_messages,
    get_or_create_general,
    list_user_conversations,
    maybe_auto_title,
    owned_conversation,
    suggest_title,
    touch_conversation,
)
from app.services.parsing import parse_resume
from app.services.profiles import get_base_profile

router = APIRouter(prefix="/api/chat", tags=["chat"])


def _latest_profile(user: User, session: Session) -> Profile | None:
    return get_base_profile(user, session)


def _user_memories(user: User, session: Session) -> list[Memory]:
    return session.exec(
        select(Memory).where(Memory.user_id == user.id).order_by(Memory.id.asc())
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


def _snapshot_profile(profile: Profile | None):
    if profile is None:
        return None
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


def _snapshot_job(job: Job | None):
    if job is None:
        return None
    return SimpleNamespace(
        title=job.title,
        company=job.company,
        location=job.location,
        summary=job.summary,
        raw_text=job.raw_text,
        requirements=list(job.requirements or []),
        keywords=list(job.keywords or []),
    )


def _snapshot_apps_jobs(
    apps: list[Application], jobs: dict[int, Job]
) -> tuple[list, dict]:
    apps_snap = [
        SimpleNamespace(
            job_id=a.job_id,
            status=SimpleNamespace(value=a.status.value),
            fit_score=a.fit_score,
        )
        for a in apps
    ]
    jobs_snap = {jid: _snapshot_job(j) for jid, j in jobs.items()}
    return apps_snap, jobs_snap


def _resolve_model(model: str | None) -> str | None:
    try:
        return validate_coach_model(model)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e


def _get_conversation(
    conversation_id: int | None, user: User, session: Session
) -> Conversation:
    if conversation_id is None:
        return get_or_create_general(user, session)
    try:
        return owned_conversation(conversation_id, user, session)
    except ValueError as e:
        raise HTTPException(404, str(e)) from e


def _owned_user_message(
    message_id: int, user: User, session: Session
) -> ChatMessage:
    msg = session.get(ChatMessage, message_id)
    if not msg or msg.user_id != user.id:
        raise HTTPException(404, "Message not found")
    if msg.role != "user":
        raise HTTPException(400, "Only user messages can be edited")
    return msg


def _delete_messages_after(
    session: Session, conversation_id: int, after_id: int
) -> list[int]:
    stale = session.exec(
        select(ChatMessage)
        .where(
            ChatMessage.conversation_id == conversation_id,
            ChatMessage.id > after_id,
        )
        .order_by(ChatMessage.id.asc())
    ).all()
    removed_ids = [m.id for m in stale if m.id is not None]
    for m in stale:
        session.delete(m)
    return removed_ids


def _history_before(
    session: Session, conversation_id: int, before_id: int
) -> list[ChatMessage]:
    return session.exec(
        select(ChatMessage)
        .where(
            ChatMessage.conversation_id == conversation_id,
            ChatMessage.id < before_id,
        )
        .order_by(ChatMessage.id.asc())
    ).all()


def _conv_context(session: Session, conv: Conversation):
    job = conversation_job(session, conv)
    jd_text = conversation_jd_block(conv, job)
    return job, jd_text


@router.get("/models", response_model=CoachModelsOut)
def get_models():
    models = list_coach_models()
    return CoachModelsOut(
        models=[CoachModelOut(**m) for m in models],
        default_model=default_model_id(),
    )


@router.get("/conversations", response_model=list[ConversationOut])
def list_conversations(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    convs = list_user_conversations(user, session)
    if not convs:
        general = get_or_create_general(user, session)
        convs = [general]
    return [
        ConversationOut(**build_conversation_out(c, session))
        for c in convs
    ]


@router.post("/conversations", response_model=ConversationOut)
def create_conversation(
    body: ConversationCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    job = None
    if body.job_id:
        job = session.get(Job, body.job_id)
        if not job or job.user_id != user.id:
            raise HTTPException(404, "Job not found")

    title = body.title.strip()
    conv = Conversation(
        user_id=user.id,
        title=title or "New conversation",
        job_id=body.job_id,
        jd_text=body.jd_text.strip() if not body.job_id else "",
    )
    if not title:
        conv.title = suggest_title(conv, job)
    session.add(conv)
    session.commit()
    session.refresh(conv)
    return ConversationOut(**build_conversation_out(conv, session, []))


@router.post(
    "/conversations/for-application/{application_id}",
    response_model=ConversationOut,
)
def get_or_create_application_conversation(
    application_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Return an existing JD-anchored Coach thread for this application, or create one."""
    app_row = session.get(Application, application_id)
    if not app_row or app_row.user_id != user.id:
        raise HTTPException(404, "Application not found")
    job = session.get(Job, app_row.job_id)
    if not job or job.user_id != user.id:
        raise HTTPException(404, "Job not found for this application")

    existing = session.exec(
        select(Conversation)
        .where(
            Conversation.user_id == user.id,
            Conversation.job_id == job.id,
        )
        .order_by(Conversation.updated_at.desc())
    ).first()
    if existing:
        return ConversationOut(**build_conversation_out(existing, session))

    conv = Conversation(user_id=user.id, job_id=job.id, title="New conversation")
    conv.title = suggest_title(conv, job)
    session.add(conv)
    session.commit()
    session.refresh(conv)
    return ConversationOut(**build_conversation_out(conv, session, []))


@router.get("/conversations/{conversation_id}", response_model=ConversationOut)
def get_conversation(
    conversation_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    conv = _get_conversation(conversation_id, user, session)
    return ConversationOut(**build_conversation_out(conv, session))


@router.patch("/conversations/{conversation_id}", response_model=ConversationOut)
def rename_conversation(
    conversation_id: int,
    body: ConversationRenameIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    conv = _get_conversation(conversation_id, user, session)
    title = body.title.strip()
    if not title:
        raise HTTPException(400, "Title is empty")
    conv.title = title
    touch_conversation(conv)
    session.add(conv)
    session.commit()
    session.refresh(conv)
    return ConversationOut(**build_conversation_out(conv, session))


@router.delete("/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    conv = _get_conversation(conversation_id, user, session)
    msgs = conversation_messages(conversation_id, user, session)
    for m in msgs:
        session.delete(m)
    session.delete(conv)
    session.commit()
    return {"ok": True}


@router.get("/conversations/{conversation_id}/messages", response_model=list[ChatMessage])
def list_conversation_messages(
    conversation_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _get_conversation(conversation_id, user, session)
    return conversation_messages(conversation_id, user, session)


@router.get("/messages", response_model=list[ChatMessage])
def list_messages(
    conversation_id: int | None = Query(default=None),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    conv = _get_conversation(conversation_id, user, session)
    return conversation_messages(conv.id or 0, user, session)


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

    model_id = _resolve_model(body.model)
    conv = _get_conversation(body.conversation_id, user, session)
    conv_id = conv.id or 0
    job, jd_text = _conv_context(session, conv)

    history = conversation_messages(conv_id, user, session)
    profile = _latest_profile(user, session)
    memories = _user_memories(user, session)
    apps = _user_applications(user, session)
    jobs = _jobs_for_apps(session, apps)

    user_msg = ChatMessage(
        user_id=user.id,
        conversation_id=conv_id,
        role="user",
        content=text,
    )
    session.add(user_msg)
    maybe_auto_title(conv, job, text)
    touch_conversation(conv)
    session.add(conv)

    reply, provider_served, model_served = coach.coach_reply(
        text,
        profile,
        memories,
        history,
        None,
        apps,
        jobs,
        model_id=model_id,
        conversation_jd_text=jd_text,
        conversation_job=job,
    )
    assistant_msg = ChatMessage(
        user_id=user.id,
        conversation_id=conv_id,
        role="assistant",
        content=reply,
        requested_model=model_id or "",
        model_served=model_served or "",
        provider_served=provider_served or "",
        fallback_used=bool(model_id and model_served and model_id != model_served),
        fallback_reason=(
            f"{model_id} was unavailable"
            if model_id and model_served and model_id != model_served
            else ""
        ),
    )
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
    model: str = Form(""),
    conversation_id: int | None = Form(default=None),
    web_search_mode: str = Form(default="auto"),
    files: list[UploadFile] = File(default=[]),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    text = message.strip()
    if not text and not files:
        raise HTTPException(400, "Message or attachment is required")

    model_id = _resolve_model(model.strip() or None)
    conv = _get_conversation(conversation_id, user, session)
    conv_id = conv.id or 0
    job, jd_text = _conv_context(session, conv)

    processed, att_meta = _process_uploads(files)

    history = conversation_messages(conv_id, user, session)
    profile = _latest_profile(user, session)
    memories = _user_memories(user, session)
    apps = _user_applications(user, session)
    jobs = _jobs_for_apps(session, apps)

    user_msg = ChatMessage(
        user_id=user.id,
        conversation_id=conv_id,
        role="user",
        content=text or "(attachment)",
        attachments=att_meta,
    )
    session.add(user_msg)
    maybe_auto_title(conv, job, text)
    touch_conversation(conv)
    session.add(conv)
    session.commit()
    session.refresh(user_msg)
    user_msg_json = user_msg.model_dump(mode="json")

    history_snap = [
        SimpleNamespace(role=m.role, content=m.content) for m in history
    ]
    memory_snap = [
        SimpleNamespace(kind=m.kind, content=m.content) for m in memories
    ]
    profile_snap = _snapshot_profile(profile)
    job_snap = _snapshot_job(job)
    apps_snap, jobs_snap = _snapshot_apps_jobs(apps, jobs)
    user_id = user.id
    coach_text = text or "Please review the attached file(s)."
    search_mode = normalize_search_mode(web_search_mode)

    async def event_stream() -> AsyncIterator[str]:
        accumulated = ""
        served: dict = {}
        route_sent = False
        try:
            if should_search(coach_text, search_mode):
                yield f"data: {json.dumps({'type': 'search', 'status': 'searching'})}\n\n"
            async for token in coach.coach_reply_stream_async(
                coach_text,
                profile_snap,
                memory_snap,
                history_snap,
                processed or None,
                apps_snap,
                jobs_snap,
                model_id=model_id,
                served=served,
                conversation_jd_text=jd_text,
                conversation_job=job_snap,
                web_search_mode=search_mode,
            ):
                if served.get("fallback_used") and not route_sent:
                    route_sent = True
                    yield f"data: {json.dumps({'type': 'route', 'requested_model': served.get('requested_model'), 'provider_served': served.get('provider'), 'model_served': served.get('model'), 'fallback_used': True, 'fallback_reason': served.get('fallback_reason')})}\n\n"
                accumulated += token
                yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

            reply = accumulated.strip()
            if not reply:
                reply, prov, mod = coach.coach_reply(
                    coach_text,
                    profile_snap,
                    memory_snap,
                    history_snap,
                    processed or None,
                    apps_snap,
                    jobs_snap,
                    model_id=model_id,
                    conversation_jd_text=jd_text,
                    conversation_job=job_snap,
                )
                served["provider"] = prov
                served["model"] = mod

            with Session(engine) as db:
                assistant_msg = ChatMessage(
                    user_id=user_id,
                    conversation_id=conv_id,
                    role="assistant",
                    content=reply,
                    requested_model=served.get("requested_model") or model_id or "",
                    model_served=served.get("model") or "",
                    provider_served=served.get("provider") or "",
                    fallback_used=bool(served.get("fallback_used")),
                    fallback_reason=served.get("fallback_reason") or "",
                )
                db.add(assistant_msg)

                new_memories = coach.extract_memories(
                    text or "(attachment)", reply, memory_snap
                )
                for item in new_memories:
                    db.add(
                        Memory(
                            user_id=user_id,
                            kind=item["kind"],
                            content=item["content"],
                        )
                    )

                db.commit()
                db.refresh(assistant_msg)
                assistant_json = assistant_msg.model_dump(mode="json")

            yield f"data: {json.dumps({'type': 'done', 'user_message': user_msg_json, 'assistant_message': assistant_json, 'provider_served': served.get('provider'), 'model_served': served.get('model'), 'requested_model': served.get('requested_model'), 'fallback_used': served.get('fallback_used', False), 'fallback_reason': served.get('fallback_reason'), 'conversation_id': conv_id, 'web_searched': served.get('web_searched', False), 'search_provider': served.get('search_provider'), 'sources': served.get('sources', []), 'web_search_error': served.get('web_search_error')})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'detail': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/messages/{message_id}/edit/stream")
async def edit_message_stream(
    message_id: int,
    body: ChatEditIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    text = body.message.strip()
    if not text:
        raise HTTPException(400, "Message is empty")

    model_id = _resolve_model(body.model)
    search_mode = normalize_search_mode(body.web_search_mode)
    user_msg = _owned_user_message(message_id, user, session)
    conv_id = user_msg.conversation_id
    if not conv_id:
        raise HTTPException(400, "Message is not tied to a conversation")

    conv = _get_conversation(conv_id, user, session)
    job, jd_text = _conv_context(session, conv)

    user_msg.content = text
    session.add(user_msg)
    removed_ids = _delete_messages_after(session, conv_id, message_id)
    touch_conversation(conv)
    session.add(conv)
    session.commit()
    session.refresh(user_msg)

    history = _history_before(session, conv_id, message_id)
    profile = _latest_profile(user, session)
    memories = _user_memories(user, session)
    apps = _user_applications(user, session)
    jobs = _jobs_for_apps(session, apps)

    user_msg_json = user_msg.model_dump(mode="json")
    history_snap = [
        SimpleNamespace(role=m.role, content=m.content) for m in history
    ]
    memory_snap = [
        SimpleNamespace(kind=m.kind, content=m.content) for m in memories
    ]
    profile_snap = _snapshot_profile(profile)
    job_snap = _snapshot_job(job)
    apps_snap, jobs_snap = _snapshot_apps_jobs(apps, jobs)
    user_id = user.id

    async def event_stream() -> AsyncIterator[str]:
        accumulated = ""
        served: dict = {}
        route_sent = False
        try:
            if should_search(text, search_mode):
                yield f"data: {json.dumps({'type': 'search', 'status': 'searching'})}\n\n"
            async for token in coach.coach_reply_stream_async(
                text,
                profile_snap,
                memory_snap,
                history_snap,
                None,
                apps_snap,
                jobs_snap,
                model_id=model_id,
                served=served,
                conversation_jd_text=jd_text,
                conversation_job=job_snap,
                web_search_mode=search_mode,
            ):
                if served.get("fallback_used") and not route_sent:
                    route_sent = True
                    yield f"data: {json.dumps({'type': 'route', 'requested_model': served.get('requested_model'), 'provider_served': served.get('provider'), 'model_served': served.get('model'), 'fallback_used': True, 'fallback_reason': served.get('fallback_reason')})}\n\n"
                accumulated += token
                yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

            reply = accumulated.strip()
            if not reply:
                reply, prov, mod = coach.coach_reply(
                    text,
                    profile_snap,
                    memory_snap,
                    history_snap,
                    None,
                    apps_snap,
                    jobs_snap,
                    model_id=model_id,
                    conversation_jd_text=jd_text,
                    conversation_job=job_snap,
                )
                served["provider"] = prov
                served["model"] = mod

            with Session(engine) as db:
                assistant_msg = ChatMessage(
                    user_id=user_id,
                    conversation_id=conv_id,
                    role="assistant",
                    content=reply,
                    requested_model=served.get("requested_model") or model_id or "",
                    model_served=served.get("model") or "",
                    provider_served=served.get("provider") or "",
                    fallback_used=bool(served.get("fallback_used")),
                    fallback_reason=served.get("fallback_reason") or "",
                )
                db.add(assistant_msg)

                new_memories = coach.extract_memories(text, reply, memory_snap)
                for item in new_memories:
                    db.add(
                        Memory(
                            user_id=user_id,
                            kind=item["kind"],
                            content=item["content"],
                        )
                    )

                db.commit()
                db.refresh(assistant_msg)
                assistant_json = assistant_msg.model_dump(mode="json")
                if served.get("model"):
                    assistant_json["model_served"] = served.get("model")
                if served.get("provider"):
                    assistant_json["provider_served"] = served.get("provider")

            yield f"data: {json.dumps({'type': 'done', 'user_message': user_msg_json, 'assistant_message': assistant_json, 'removed_message_ids': removed_ids, 'provider_served': served.get('provider'), 'model_served': served.get('model'), 'requested_model': served.get('requested_model'), 'fallback_used': served.get('fallback_used', False), 'fallback_reason': served.get('fallback_reason'), 'conversation_id': conv_id, 'web_searched': served.get('web_searched', False), 'search_provider': served.get('search_provider'), 'sources': served.get('sources', []), 'web_search_error': served.get('web_search_error')})}\n\n"
        except Exception as e:
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
        is_base=False,
        source_filename="coach-update",
    )
    session.add(new_profile)
    session.commit()
    session.refresh(new_profile)
    return new_profile
