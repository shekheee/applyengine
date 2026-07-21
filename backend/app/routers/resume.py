from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlmodel import Session, select

from app.auth import get_current_user
from app.db import get_session
from app.models import Job, Memory, Profile, User
from app.services.profiles import get_base_profile
from app.services.resume_designed import design_resume_preview
from app.services.resume_docx import build_resume_docx
from app.services.resume_pdf import build_resume_pdf

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


@router.post("/design")
def generate_designed_resume(
    job_id: int | None = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Run Claude Opus resume design and return a preview summary."""
    profile = _latest_profile(user, session)
    memories = _user_memories(user, session)
    job = _optional_job(user, session, job_id)
    try:
        return design_resume_preview(profile, memories, job)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(
            status_code=500, detail="Failed to generate designed resume."
        ) from e


@router.get("/pdf")
def download_resume_pdf(
    job_id: int | None = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Generate and download a Claude-designed PDF resume (1-page target)."""
    profile = _latest_profile(user, session)
    memories = _user_memories(user, session)
    job = _optional_job(user, session, job_id)
    try:
        pdf_bytes, filename = build_resume_pdf(profile, memories, job)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
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
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Download a Claude-designed .docx for editing in Google Docs."""
    profile = _latest_profile(user, session)
    memories = _user_memories(user, session)
    job = _optional_job(user, session, job_id)
    try:
        docx_bytes, filename = build_resume_docx(profile, memories, job)
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
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )
