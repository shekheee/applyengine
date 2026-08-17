from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlmodel import Session, select

from app.auth import get_current_user
from app.db import get_session
from app.models import Job, SkillArtifact, User
from app.schemas import SkillArtifactCreate, SkillArtifactOut, SkillArtifactRevise, SkillOut
from app.services.profiles import get_base_profile
from app.services.skill_exports import (
    render_document_docx,
    render_document_pdf,
    render_presentation_pptx,
    safe_filename,
)
from app.services.skill_generation import generate_skill_content
from app.services.skill_registry import GENERATIVE_SKILL_IDS, list_skills

router = APIRouter(prefix="/api/skills", tags=["skills"])


def _owned_job(user: User, job_id: int | None, session: Session) -> Job | None:
    if job_id is None:
        return None
    job = session.get(Job, job_id)
    if not job or job.user_id != user.id:
        raise HTTPException(404, "Job not found")
    return job


def _owned_artifact(user: User, artifact_id: int, session: Session) -> SkillArtifact:
    artifact = session.get(SkillArtifact, artifact_id)
    if not artifact or artifact.user_id != user.id:
        raise HTTPException(404, "Artifact not found")
    return artifact


def _to_out(artifact: SkillArtifact) -> SkillArtifactOut:
    return SkillArtifactOut(
        id=artifact.id or 0,
        skill_id=artifact.skill_id,
        title=artifact.title,
        template=artifact.template,
        job_id=artifact.job_id,
        parent_id=artifact.parent_id,
        brief=artifact.brief,
        content=artifact.content_json or {},
        requested_model=artifact.requested_model or None,
        model_served=artifact.model_served or None,
        provider_served=artifact.provider_served or None,
        created_at=artifact.created_at.isoformat() if artifact.created_at else "",
    )


@router.get("", response_model=list[SkillOut])
def skills_catalog(user: User = Depends(get_current_user)):
    _ = user
    return [SkillOut(**item) for item in list_skills()]


@router.get("/artifacts", response_model=list[SkillArtifactOut])
def artifact_history(
    skill_id: str | None = Query(default=None),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    statement = select(SkillArtifact).where(SkillArtifact.user_id == user.id)
    if skill_id:
        statement = statement.where(SkillArtifact.skill_id == skill_id)
    artifacts = session.exec(statement.order_by(SkillArtifact.id.desc())).all()
    return [_to_out(item) for item in artifacts]


@router.get("/artifacts/{artifact_id}", response_model=SkillArtifactOut)
def get_artifact(
    artifact_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    return _to_out(_owned_artifact(user, artifact_id, session))


@router.post("/artifacts", response_model=SkillArtifactOut)
def create_artifact(
    body: SkillArtifactCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if body.skill_id not in GENERATIVE_SKILL_IDS:
        raise HTTPException(422, "Choose Document Writer or Presentation Builder")
    brief = body.brief.strip()
    if not brief:
        raise HTTPException(400, "Describe what you want to create")
    profile = get_base_profile(user, session)
    job = _owned_job(user, body.job_id, session)
    try:
        content, provider, model, requested = generate_skill_content(
            skill_id=body.skill_id,
            template=body.template,
            title=body.title.strip(),
            brief=brief,
            profile=profile,
            job=job,
            model_id=body.model,
            reasoning_effort=body.reasoning_effort,
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, f"Artifact generation failed: {exc}") from exc
    artifact = SkillArtifact(
        user_id=user.id or 0,
        skill_id=body.skill_id,
        title=str(content.get("title") or body.title or "Untitled artifact"),
        template=body.template,
        job_id=job.id if job else None,
        brief=brief,
        content_json=content,
        requested_model=requested or body.model or "",
        model_served=model or "",
        provider_served=provider or "",
    )
    session.add(artifact)
    session.commit()
    session.refresh(artifact)
    return _to_out(artifact)


@router.post("/artifacts/{artifact_id}/revise", response_model=SkillArtifactOut)
def revise_artifact(
    artifact_id: int,
    body: SkillArtifactRevise,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    source = _owned_artifact(user, artifact_id, session)
    instruction = body.instruction.strip()
    if not instruction:
        raise HTTPException(400, "Describe the revision you want")
    profile = get_base_profile(user, session)
    job = _owned_job(user, source.job_id, session)
    try:
        content, provider, model, requested = generate_skill_content(
            skill_id=source.skill_id,
            template=source.template,
            title=source.title,
            brief=source.brief,
            profile=profile,
            job=job,
            model_id=body.model,
            reasoning_effort=body.reasoning_effort,
            existing=source.content_json,
            revision_instruction=instruction,
        )
    except Exception as exc:
        raise HTTPException(502, f"Artifact revision failed: {exc}") from exc
    artifact = SkillArtifact(
        user_id=user.id or 0,
        skill_id=source.skill_id,
        title=str(content.get("title") or source.title),
        template=source.template,
        job_id=source.job_id,
        parent_id=source.id,
        brief=source.brief,
        content_json=content,
        requested_model=requested or body.model or "",
        model_served=model or "",
        provider_served=provider or "",
    )
    session.add(artifact)
    session.commit()
    session.refresh(artifact)
    return _to_out(artifact)


@router.get("/artifacts/{artifact_id}/download")
def download_artifact(
    artifact_id: int,
    format: str = Query(..., pattern="^(docx|pdf|pptx)$"),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    artifact = _owned_artifact(user, artifact_id, session)
    if artifact.skill_id == "document-writer" and format == "docx":
        data = render_document_docx(artifact.content_json)
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    elif artifact.skill_id == "document-writer" and format == "pdf":
        data = render_document_pdf(artifact.content_json)
        media_type = "application/pdf"
    elif artifact.skill_id == "presentation-builder" and format == "pptx":
        data = render_presentation_pptx(artifact.content_json)
        media_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    else:
        raise HTTPException(422, "That format is not available for this skill")
    filename = f"{safe_filename(artifact.title)}.{format}"
    return Response(
        content=data,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )
