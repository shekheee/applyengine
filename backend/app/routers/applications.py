from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlmodel import Session, select

from app.auth import get_current_user
from app.db import get_session
from app.models import Application, ApplicationStatus, Job, Profile, User
from app.schemas import ApplicationCreate, NotesUpdate, StatusUpdate
from app.services.doc_export import text_to_docx
from app.services.matching import compute_fit, gap_analysis
from app.services.profiles import get_base_profile, normalize_profile
from app.services.serialize import job_to_text, profile_to_text

router = APIRouter(prefix="/api/applications", tags=["applications"])


def _latest_profile(user: User, session: Session) -> Profile | None:
    return get_base_profile(user, session)


def _owned_application(app_id: int, user: User, session: Session) -> Application:
    a = session.get(Application, app_id)
    if not a or a.user_id != user.id:
        raise HTTPException(404, "Application not found")
    return a


def _compute_application_fit(profile: Profile, job: Job) -> dict:
    profile_text = profile_to_text(profile)
    job_text = job_to_text(job)
    skills = profile.skills or []
    keywords = job.keywords or []
    fit = compute_fit(profile_text, job_text, keywords, skills)
    analysis = gap_analysis(profile_text, job_text, fit)
    return {
        "fit_score": fit["fit_score"],
        "keyword_coverage": fit["keyword_coverage"],
        "matched_keywords": fit["matched_keywords"],
        "missing_keywords": fit["missing_keywords"],
        "gap_analysis": analysis,
    }


def _apply_fit_to_application(
    app_row: Application,
    profile: Profile,
    job: Job,
) -> None:
    fit_fields = _compute_application_fit(profile, job)
    app_row.profile_id = profile.id
    app_row.fit_score = fit_fields["fit_score"]
    app_row.keyword_coverage = fit_fields["keyword_coverage"]
    app_row.matched_keywords = fit_fields["matched_keywords"]
    app_row.missing_keywords = fit_fields["missing_keywords"]
    app_row.gap_analysis = fit_fields["gap_analysis"]
    app_row.updated_at = datetime.now(timezone.utc)


@router.post("", response_model=Application)
def create_application(
    body: ApplicationCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    job = session.get(Job, body.job_id)
    if not job or job.user_id != user.id:
        raise HTTPException(404, "Job not found")

    if body.profile_id:
        profile = session.get(Profile, body.profile_id)
        if profile and profile.user_id != user.id:
            profile = None
    else:
        profile = _latest_profile(user, session)
    if not profile:
        raise HTTPException(400, "No profile available; create one first")

    fit_fields = _compute_application_fit(profile, job)

    app_row = Application(
        user_id=user.id,
        job_id=job.id,
        profile_id=profile.id,
        status=ApplicationStatus.saved,
        fit_score=fit_fields["fit_score"],
        keyword_coverage=fit_fields["keyword_coverage"],
        matched_keywords=fit_fields["matched_keywords"],
        missing_keywords=fit_fields["missing_keywords"],
        gap_analysis=fit_fields["gap_analysis"],
    )
    session.add(app_row)
    session.commit()
    session.refresh(app_row)
    return app_row


@router.get("", response_model=list[Application])
def list_applications(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    return session.exec(
        select(Application)
        .where(Application.user_id == user.id)
        .order_by(Application.updated_at.desc())
    ).all()


@router.get("/{app_id}", response_model=Application)
def get_application(
    app_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    return _owned_application(app_id, user, session)


@router.patch("/{app_id}/status", response_model=Application)
def update_status(
    app_id: int,
    body: StatusUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    a = _owned_application(app_id, user, session)
    a.status = body.status
    if body.status == ApplicationStatus.applied and a.applied_at is None:
        a.applied_at = datetime.now(timezone.utc)
    a.updated_at = datetime.now(timezone.utc)
    session.add(a)
    session.commit()
    session.refresh(a)
    return a


@router.patch("/{app_id}/notes", response_model=Application)
def update_notes(
    app_id: int,
    body: NotesUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    a = _owned_application(app_id, user, session)
    a.notes = body.notes
    a.updated_at = datetime.now(timezone.utc)
    session.add(a)
    session.commit()
    session.refresh(a)
    return a


@router.post("/{app_id}/analyze-fit", response_model=Application)
def analyze_fit(
    app_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Recompute fit against the user's current base profile and linked job."""
    app_row = _owned_application(app_id, user, session)
    job = session.get(Job, app_row.job_id)
    if not job or job.user_id != user.id:
        raise HTTPException(404, "Job not found")

    profile = _latest_profile(user, session)
    if not profile:
        raise HTTPException(400, "No base resume yet — upload your profile first")

    profile = normalize_profile(profile)
    _apply_fit_to_application(app_row, profile, job)
    session.add(app_row)
    session.commit()
    session.refresh(app_row)
    return app_row


@router.get("/{app_id}/export/{doc}")
def export_document(
    app_id: int,
    doc: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    a = _owned_application(app_id, user, session)
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
