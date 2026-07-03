from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlmodel import Session, select

from app.db import get_session
from app.models import Application, ApplicationStatus, Job, Profile
from app.schemas import ApplicationCreate, NotesUpdate, StatusUpdate
from app.services.doc_export import text_to_docx
from app.services.matching import compute_fit, gap_analysis
from app.services.serialize import job_to_text, profile_to_text

router = APIRouter(prefix="/api/applications", tags=["applications"])


def _latest_profile(session: Session) -> Profile | None:
    return session.exec(select(Profile).order_by(Profile.id.desc())).first()


@router.post("", response_model=Application)
def create_application(body: ApplicationCreate, session: Session = Depends(get_session)):
    job = session.get(Job, body.job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    profile = (
        session.get(Profile, body.profile_id)
        if body.profile_id
        else _latest_profile(session)
    )
    if not profile:
        raise HTTPException(400, "No profile available; create one first")

    profile_text = profile_to_text(profile)
    job_text = job_to_text(job)
    fit = compute_fit(profile_text, job_text, job.keywords, profile.skills)
    analysis = gap_analysis(profile_text, job_text, fit)

    app_row = Application(
        job_id=job.id,
        profile_id=profile.id,
        status=ApplicationStatus.saved,
        fit_score=fit["fit_score"],
        keyword_coverage=fit["keyword_coverage"],
        matched_keywords=fit["matched_keywords"],
        missing_keywords=fit["missing_keywords"],
        gap_analysis=analysis,
    )
    session.add(app_row)
    session.commit()
    session.refresh(app_row)
    return app_row


@router.get("", response_model=list[Application])
def list_applications(session: Session = Depends(get_session)):
    return session.exec(select(Application).order_by(Application.updated_at.desc())).all()


@router.get("/{app_id}", response_model=Application)
def get_application(app_id: int, session: Session = Depends(get_session)):
    a = session.get(Application, app_id)
    if not a:
        raise HTTPException(404, "Application not found")
    return a


@router.patch("/{app_id}/status", response_model=Application)
def update_status(
    app_id: int, body: StatusUpdate, session: Session = Depends(get_session)
):
    a = session.get(Application, app_id)
    if not a:
        raise HTTPException(404, "Application not found")
    a.status = body.status
    if body.status == ApplicationStatus.applied and a.applied_at is None:
        a.applied_at = datetime.now(timezone.utc)
    a.updated_at = datetime.now(timezone.utc)
    session.add(a)
    session.commit()
    session.refresh(a)
    return a


@router.patch("/{app_id}/notes", response_model=Application)
def update_notes(app_id: int, body: NotesUpdate, session: Session = Depends(get_session)):
    a = session.get(Application, app_id)
    if not a:
        raise HTTPException(404, "Application not found")
    a.notes = body.notes
    a.updated_at = datetime.now(timezone.utc)
    session.add(a)
    session.commit()
    session.refresh(a)
    return a


@router.get("/{app_id}/export/{doc}")
def export_document(app_id: int, doc: str, session: Session = Depends(get_session)):
    a = session.get(Application, app_id)
    if not a:
        raise HTTPException(404, "Application not found")
    if doc == "resume":
        content, title, fname = a.tailored_resume, "Resume", "tailored_resume.docx"
    elif doc == "cover_letter":
        content, title, fname = a.cover_letter, "Cover Letter", "cover_letter.docx"
    else:
        raise HTTPException(400, "doc must be 'resume' or 'cover_letter'")
    if not content.strip():
        raise HTTPException(400, f"No {doc} generated yet")

    data = text_to_docx(content, title=title)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )
