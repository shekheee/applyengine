from __future__ import annotations

from pydantic import BaseModel

from app.models import ApplicationStatus


class ResumeTextIn(BaseModel):
    raw_text: str


class JobIn(BaseModel):
    raw_text: str
    url: str = ""


class ApplicationCreate(BaseModel):
    job_id: int
    profile_id: int | None = None  # defaults to the latest profile


class StatusUpdate(BaseModel):
    status: ApplicationStatus


class NotesUpdate(BaseModel):
    notes: str


class GenerateRequest(BaseModel):
    application_id: int
    what: list[str] = ["resume", "cover_letter", "interview_prep"]
