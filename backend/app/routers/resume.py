from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlmodel import Session, select

from app.auth import get_current_user
from app.db import get_session
from app.models import Job, Memory, Profile, ResumeVersionKind, User
from app.schemas import ResumeDesignOut, ResumeVersionOut
from app.services.profiles import get_base_profile
from app.services.resume_designed import design_resume_with_claude
from app.services.resume_docx import build_resume_docx_from_doc, render_resume_docx
from app.services.resume_html import design_resume_html_fitted
from app.services.resume_html_pdf import html_to_pdf_one_page
from app.services.resume_pdf import (
    _safe_filename,
    build_resume_pdf,
    build_resume_pdf_from_profile,
)
from app.services.resume_versions import (
    create_designed_version,
    ensure_base_version,
    get_user_version,
    list_user_versions,
    version_to_api,
)

router = APIRouter(prefix="/api/resume", tags=["resume"])


def _latest_profile(user: User, session: Session) -> Profile | None:
    return get_base_profile(user, session)


def _user_memories(user: User, session: Session) -> list[Memory]:
    return session.exec(
        select(Memory).where(Memory.user_id == user.id).order_by(Memory.id.asc())
    ).all()


def _optional_job(user: User, session: Session, job_id: int | None) -> Job | None:
    if not job_id:
        return None
    job = session.get(Job, job_id)
    if not job or job.user_id != user.id:
        raise HTTPException(404, "Job not found")
    return job


def _resolve_version(
    user: User,
    session: Session,
    version_id: int | None,
) -> tuple:
    """Return (version_or_none, profile, memories)."""
    profile = _latest_profile(user, session)
    memories = _user_memories(user, session)
    if version_id is None:
        return None, profile, memories
    version = get_user_version(user, version_id, session)
    if not version:
        raise HTTPException(404, "Resume version not found")
    return version, profile, memories


def _structured_for_version(
    version,
    profile: Profile | None,
    memories: list[Memory],
    job: Job | None,
    session: Session,
) -> dict:
    if version and version.structured_json:
        return version.structured_json
    doc, _, _ = design_resume_with_claude(profile, memories, job)
    if version:
        version.structured_json = doc
        session.add(version)
        session.commit()
        session.refresh(version)
    return doc


@router.get("/versions", response_model=list[ResumeVersionOut])
def list_versions(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    profile = _latest_profile(user, session)
    if profile:
        ensure_base_version(user, profile, session)
    versions = list_user_versions(user, session)
    return [ResumeVersionOut(**version_to_api(v)) for v in versions]


@router.get("/versions/{version_id}", response_model=ResumeVersionOut)
def get_version(
    version_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    version = get_user_version(user, version_id, session)
    if not version:
        raise HTTPException(404, "Resume version not found")
    return ResumeVersionOut(**version_to_api(version, include_html=True))


@router.post("/design", response_model=ResumeDesignOut)
def generate_designed_resume(
    job_id: int | None = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Generate Claude Artifacts-style HTML resume and save as a new version."""
    profile = _latest_profile(user, session)
    memories = _user_memories(user, session)
    job = _optional_job(user, session, job_id)
    try:
        html_doc, provider, model, _fit_level = design_resume_html_fitted(
            profile, memories, job
        )
        version = create_designed_version(
            user,
            session,
            html_content=html_doc,
            profile=profile,
            job=job,
            model_served=model,
            provider_served=provider,
        )
        return ResumeDesignOut(
            version_id=version.id or 0,
            html_content=html_doc,
            name=profile.name if profile else "",
            model_served=model,
            provider_served=provider,
            tailored_to_job=bool(job),
            job_title=job.title if job else "",
            job_company=job.company if job else "",
            title=version.title,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(
            status_code=500, detail="Failed to generate designed resume."
        ) from e


@router.get("/pdf")
def download_resume_pdf(
    job_id: int | None = None,
    version_id: int | None = None,
    mode: str = "designed",
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Download PDF — from saved HTML version, or ATS ReportLab path."""
    version, profile, memories = _resolve_version(user, session, version_id)
    job = _optional_job(user, session, job_id)
    if version and version.job_id and not job_id:
        job = session.get(Job, version.job_id)

    try:
        if mode == "ats":
            if version and version.kind == ResumeVersionKind.base.value and profile:
                pdf_bytes, filename = build_resume_pdf_from_profile(profile, memories)
            else:
                pdf_bytes, filename = build_resume_pdf(profile, memories, job)
        elif version and version.html_content.strip():
            pdf_bytes, _engine, fitted_html, _level = html_to_pdf_one_page(
                version.html_content
            )
            if fitted_html != version.html_content:
                version.html_content = fitted_html
                session.add(version)
                session.commit()
            name = profile.name if profile else "resume"
            filename = f"{_safe_filename(name)}_resume.pdf"
        elif version_id is None:
            pdf_bytes, filename = build_resume_pdf(profile, memories, job)
        else:
            raise HTTPException(400, "Selected version has no HTML content.")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail="Failed to generate resume PDF."
        ) from e

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


@router.get("/docx")
def download_resume_docx(
    job_id: int | None = None,
    version_id: int | None = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Download .docx for Google Docs — from structured JSON (lazy-generated if needed)."""
    version, profile, memories = _resolve_version(user, session, version_id)
    job = _optional_job(user, session, job_id)
    if version and version.job_id and not job_id:
        job = session.get(Job, version.job_id)

    try:
        if version and version.kind == ResumeVersionKind.base.value and profile:
            from app.services.resume_pdf import _merge_memories, _profile_to_doc

            doc = _merge_memories(_profile_to_doc(profile), memories)
            docx_bytes = render_resume_docx(doc)
            fname = f"{_safe_filename(doc.get('name', 'resume'))}_resume.docx"
        else:
            doc = _structured_for_version(version, profile, memories, job, session)
            docx_bytes, fname = build_resume_docx_from_doc(doc)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(
            status_code=500, detail="Failed to generate resume document."
        ) from e

    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f'attachment; filename="{fname}"',
            "Cache-Control": "no-store",
        },
    )
