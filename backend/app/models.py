from datetime import datetime, timezone
from enum import Enum
from typing import Any

from sqlalchemy import JSON, Column, Text
from sqlmodel import Field, SQLModel


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ApplicationStatus(str, Enum):
    saved = "saved"
    applied = "applied"
    interview = "interview"
    offer = "offer"
    rejected = "rejected"


class Profile(SQLModel, table=True):
    """The candidate's master profile, parsed from their resume."""

    id: int | None = Field(default=None, primary_key=True)
    name: str = ""
    email: str = ""
    phone: str = ""
    location: str = ""
    summary: str = Field(default="", sa_column=Column(Text))
    raw_text: str = Field(default="", sa_column=Column(Text))
    links: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    skills: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    experience: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    projects: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    education: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=_now)


class Job(SQLModel, table=True):
    """A job posting, parsed into structured fields."""

    id: int | None = Field(default=None, primary_key=True)
    title: str = ""
    company: str = ""
    location: str = ""
    url: str = ""
    seniority: str = ""
    raw_text: str = Field(default="", sa_column=Column(Text))
    summary: str = Field(default="", sa_column=Column(Text))
    requirements: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    keywords: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=_now)


class Application(SQLModel, table=True):
    """Links a profile to a job, holding generated materials and pipeline state."""

    id: int | None = Field(default=None, primary_key=True)
    job_id: int = Field(foreign_key="job.id", index=True)
    profile_id: int = Field(foreign_key="profile.id", index=True)
    status: ApplicationStatus = Field(default=ApplicationStatus.saved, index=True)

    fit_score: float | None = None
    keyword_coverage: float | None = None
    matched_keywords: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    missing_keywords: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    gap_analysis: str = Field(default="", sa_column=Column(Text))

    tailored_resume: str = Field(default="", sa_column=Column(Text))
    cover_letter: str = Field(default="", sa_column=Column(Text))
    interview_prep: str = Field(default="", sa_column=Column(Text))

    notes: str = Field(default="", sa_column=Column(Text))
    applied_at: datetime | None = None
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
