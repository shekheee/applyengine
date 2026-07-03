from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.db import get_session
from app.models import Application, Job, Profile
from app.schemas import GenerateRequest
from app.services.generation import cover_letter, interview_prep, tailor_resume
from app.services.serialize import job_to_text, profile_to_text

router = APIRouter(prefix="/api/generate", tags=["generate"])


@router.post("", response_model=Application)
def generate(body: GenerateRequest, session: Session = Depends(get_session)):
    app_row = session.get(Application, body.application_id)
    if not app_row:
        raise HTTPException(404, "Application not found")
    job = session.get(Job, app_row.job_id)
    profile = session.get(Profile, app_row.profile_id)
    if not job or not profile:
        raise HTTPException(404, "Linked job or profile missing")

    profile_text = profile_to_text(profile)
    job_text = job_to_text(job)

    if "resume" in body.what:
        app_row.tailored_resume = tailor_resume(profile_text, job_text, job.keywords)
    if "cover_letter" in body.what:
        app_row.cover_letter = cover_letter(
            profile_text, job_text, job.company, job.title
        )
    if "interview_prep" in body.what:
        app_row.interview_prep = interview_prep(profile_text, job_text)

    app_row.updated_at = datetime.now(timezone.utc)
    session.add(app_row)
    session.commit()
    session.refresh(app_row)
    return app_row
