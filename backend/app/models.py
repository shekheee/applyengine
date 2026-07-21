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


class User(SQLModel, table=True):
    """An authenticated account. All other data is scoped to a user."""

    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    name: str = ""
    hashed_password: str = ""
    created_at: datetime = Field(default_factory=_now)


class Profile(SQLModel, table=True):
    """The candidate's master profile, parsed from their resume."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
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
    is_base: bool = Field(default=True, index=True)
    source_filename: str = ""
    created_at: datetime = Field(default_factory=_now)


class Job(SQLModel, table=True):
    """A job posting, parsed into structured fields."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
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
    user_id: int = Field(foreign_key="user.id", index=True)
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


class Conversation(SQLModel, table=True):
    """A scoped Coach thread — optionally anchored to a job description."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    title: str = "New conversation"
    job_id: int | None = Field(default=None, foreign_key="job.id", index=True)
    jd_text: str = Field(default="", sa_column=Column(Text))
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class ChatMessage(SQLModel, table=True):
    """A single turn in the career-coach conversation."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    conversation_id: int | None = Field(
        default=None, foreign_key="conversation.id", index=True
    )
    role: str = "user"  # "user" | "assistant"
    content: str = Field(default="", sa_column=Column(Text))
    attachments: list[dict[str, str]] = Field(
        default_factory=list, sa_column=Column(JSON)
    )
    created_at: datetime = Field(default_factory=_now)


class Memory(SQLModel, table=True):
    """A durable fact the coach has learned about the user."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    kind: str = "fact"  # e.g. skill | experience | preference | goal | achievement | fact
    content: str = Field(default="", sa_column=Column(Text))
    created_at: datetime = Field(default_factory=_now)


class InterviewSession(SQLModel, table=True):
    """An interview practice session tailored to the user's resume and optional job."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    job_id: int | None = Field(default=None, foreign_key="job.id", index=True)
    focus: str = "mixed"  # behavioral | role_technical | case_study | leadership_stakeholder | resume_deep_dive | mixed
    difficulty: str = "mid"  # junior | mid | senior
    curriculum_topic: str = ""  # "" | all | ml_classics | llm_fundamentals | ... (AI/ML track)
    status: str = "active"  # active | completed
    questions: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    current_index: int = 0
    summary: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    recurring_weaknesses: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    overall_score: float | None = None
    model_id: str = ""
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class InterviewTurn(SQLModel, table=True):
    """A single turn within an interview practice session."""

    id: int | None = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="interviewsession.id", index=True)
    question_index: int = 0
    role: str = "candidate"  # candidate | feedback | followup
    content: str = Field(default="", sa_column=Column(Text))
    scores: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=_now)
