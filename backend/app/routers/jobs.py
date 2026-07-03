from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.auth import get_current_user
from app.db import get_session
from app.models import Job, User
from app.schemas import JobIn
from app.services.parsing import parse_job

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.post("", response_model=Job)
def create_job(
    body: JobIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if not body.raw_text.strip():
        raise HTTPException(400, "Job description is empty")
    parsed = parse_job(body.raw_text)
    job = Job(
        user_id=user.id,
        title=parsed.get("title", ""),
        company=parsed.get("company", ""),
        location=parsed.get("location", ""),
        url=body.url,
        seniority=parsed.get("seniority", "unknown"),
        raw_text=parsed.get("raw_text", body.raw_text),
        summary=parsed.get("summary", ""),
        requirements=parsed.get("requirements", []),
        keywords=parsed.get("keywords", []),
    )
    session.add(job)
    session.commit()
    session.refresh(job)
    return job


@router.get("", response_model=list[Job])
def list_jobs(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    return session.exec(
        select(Job).where(Job.user_id == user.id).order_by(Job.created_at.desc())
    ).all()


@router.get("/{job_id}", response_model=Job)
def get_job(
    job_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    j = session.get(Job, job_id)
    if not j or j.user_id != user.id:
        raise HTTPException(404, "Job not found")
    return j
