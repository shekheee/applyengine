from __future__ import annotations

from pydantic import BaseModel

from app.models import ApplicationStatus


class RegisterIn(BaseModel):
    email: str
    password: str
    name: str = ""
    signup_code: str = ""


class LoginIn(BaseModel):
    email: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: str
    name: str


class ChatIn(BaseModel):
    message: str
    model: str | None = None


class CoachModelOut(BaseModel):
    id: str
    label: str
    provider: str
    provider_label: str
    is_default: bool


class CoachModelsOut(BaseModel):
    models: list[CoachModelOut]
    default_model: str


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


class InterviewSessionCreate(BaseModel):
    focus: str = "mixed"
    difficulty: str = "mid"
    job_id: int | None = None
    model: str | None = None


class InterviewAnswerIn(BaseModel):
    answer: str
    question_index: int | None = None
    model: str | None = None


class InterviewFollowupIn(BaseModel):
    message: str
    question_index: int | None = None
    model: str | None = None


class InterviewCompleteIn(BaseModel):
    model: str | None = None


class InterviewTurnOut(BaseModel):
    id: int
    session_id: int
    question_index: int
    role: str
    content: str
    scores: dict = {}
    created_at: str = ""

    model_config = {"from_attributes": True}


class InterviewSessionOut(BaseModel):
    id: int
    job_id: int | None = None
    focus: str
    difficulty: str
    status: str
    questions: list[dict] = []
    current_index: int = 0
    summary: dict = {}
    recurring_weaknesses: list[str] = []
    model_id: str = ""
    created_at: str = ""
    updated_at: str = ""
    turns: list[InterviewTurnOut] = []
