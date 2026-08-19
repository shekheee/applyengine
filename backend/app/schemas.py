from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

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
    conversation_id: int | None = None
    web_search_mode: str = "auto"
    reasoning_effort: str = "medium"
    answer_length: str = "normal"
    coach_mode: str = "career"


class ChatEditIn(BaseModel):
    message: str
    model: str | None = None
    web_search_mode: str = "auto"
    reasoning_effort: str = "medium"
    answer_length: str = "normal"
    coach_mode: str = "career"


class ConversationCreate(BaseModel):
    title: str = ""
    job_id: int | None = None
    jd_text: str = ""


class ConversationRenameIn(BaseModel):
    title: str


class ConversationOut(BaseModel):
    id: int
    title: str
    job_id: int | None = None
    job_title: str = ""
    job_company: str = ""
    has_jd: bool = False
    jd_preview: str = ""
    message_preview: str = ""
    message_count: int = 0
    created_at: str = ""
    updated_at: str = ""


class ChatMessageOut(BaseModel):
    id: int
    role: str
    content: str
    attachments: list[dict] = []
    conversation_id: int | None = None
    created_at: str = ""
    model_served: str | None = None
    provider_served: str | None = None
    requested_model: str | None = None
    fallback_used: bool = False
    fallback_reason: str | None = None
    reasoning_effort: str | None = None

    model_config = {"from_attributes": True}


class CoachModelOut(BaseModel):
    id: str
    label: str
    provider: str
    provider_label: str
    is_default: bool


class CoachModelsOut(BaseModel):
    models: list[CoachModelOut]
    default_model: str


class SkillOut(BaseModel):
    id: str
    name: str
    description: str
    category: str
    href: str
    output_formats: list[str]
    status: str = "ready"


class SkillArtifactCreate(BaseModel):
    skill_id: str
    template: str
    title: str = ""
    brief: str
    job_id: int | None = None
    model: str | None = None
    reasoning_effort: str = "high"


class SkillArtifactRevise(BaseModel):
    instruction: str
    model: str | None = None
    reasoning_effort: str = "high"


class SkillArtifactOut(BaseModel):
    id: int
    skill_id: str
    title: str
    template: str
    job_id: int | None = None
    parent_id: int | None = None
    brief: str
    content: dict[str, Any]
    requested_model: str | None = None
    model_served: str | None = None
    provider_served: str | None = None
    created_at: str


class SocialProjectCreate(BaseModel):
    platform: str = "linkedin"
    title: str = ""
    settings: dict[str, Any] = Field(default_factory=dict)


class SocialProjectUpdate(BaseModel):
    title: str | None = None
    status: str | None = None
    settings: dict[str, Any] | None = None
    current_content: str | None = None


class SocialMessageIn(BaseModel):
    message: str
    model: str | None = None


class SocialProjectOut(BaseModel):
    id: int
    platform: str
    title: str
    status: str
    settings: dict[str, Any] = Field(default_factory=dict)
    current_content: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SocialMessageOut(BaseModel):
    id: int
    project_id: int
    role: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


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
    curriculum_topic: str = ""  # AI/ML track: "" | all | ml_classics | ...
    mode: str = "text"  # text | live
    behavior_mode: str = "simulation"  # simulation | coach
    interviewer_persona: str = "hiring_manager"
    captions: str = "progressive"  # progressive | hidden


class InterviewSessionUpdate(BaseModel):
    title: str | None = None
    archived: bool | None = None


class InterviewLiveTurnIn(BaseModel):
    candidate_answer: str | None = None
    model: str | None = None
    request_id: str | None = None
    delivery: dict[str, Any] | None = None
    candidate_intent: str = "answer"  # answer | clarification | candidate_question


class InterviewLiveTtsIn(BaseModel):
    text: str
    voice: str | None = None


class InterviewAnswerIn(BaseModel):
    answer: str
    question_index: int | None = None
    model: str | None = None
    request_id: str | None = None
    delivery: dict[str, Any] | None = None


class InterviewFollowupIn(BaseModel):
    message: str
    question_index: int | None = None
    model: str | None = None


class InterviewCompleteIn(BaseModel):
    model: str | None = None


class InterviewTurnOut(BaseModel):
    id: int
    session_id: int
    request_id: str = ""
    question_index: int
    role: str
    content: str
    scores: dict = {}
    created_at: str = ""

    model_config = {"from_attributes": True}


class InterviewSessionOut(BaseModel):
    id: int
    job_id: int | None = None
    title: str = ""
    archived: bool = False
    focus: str
    difficulty: str
    curriculum_topic: str = ""
    mode: str = "text"
    live_state: dict = {}
    status: str
    questions: list[dict] = []
    current_index: int = 0
    summary: dict = {}
    recurring_weaknesses: list[str] = []
    overall_score: float | None = None
    model_id: str = ""
    created_at: str = ""
    updated_at: str = ""
    turns: list[InterviewTurnOut] = []


class DeliveryMetricsOut(BaseModel):
    words_per_minute: int = 0
    word_count: int = 0
    filler_count: int = 0
    filler_rate_per_100: int = 0
    filler_breakdown: dict[str, int] = {}
    pause_count: int = 0
    longest_pause_ms: int = 0
    pauses: list[dict] = []
    duration_seconds: float = 0
    observations: list[str] = []


class TranscribeOut(BaseModel):
    text: str
    duration_seconds: float = 0
    delivery: DeliveryMetricsOut
    model: str = "whisper-1"


class ProgressScorePoint(BaseModel):
    session_id: int
    date: str
    score: float
    focus: str
    difficulty: str = ""
    curriculum_topic: str = ""


class ProgressTheme(BaseModel):
    text: str
    count: int


class InterviewProgressOut(BaseModel):
    total_sessions: int = 0
    completed_sessions: int = 0
    scored_sessions: int = 0
    average_score: float | None = None
    best_score: float | None = None
    worst_score: float | None = None
    score_over_time: list[ProgressScorePoint] = []
    focus_averages: dict[str, float] = {}
    best_focus_area: str | None = None
    weakest_focus_area: str | None = None
    topic_averages: dict[str, float] = {}
    best_topic_area: str | None = None
    weakest_topic_area: str | None = None
    topic_labels: dict[str, str] = {}
    recurring_themes: list[ProgressTheme] = []
    skill_pointers: list[ProgressTheme] = []
    top_strengths: list[ProgressTheme] = []
    activity_streak_days: int = 0
    trend: str = "stable"
    delivery_averages: dict[str, float] = {}


class CurriculumTopicOut(BaseModel):
    id: str
    order: int
    title: str
    tagline: str
    subtopics: list[str]
    senior_signals: list[str]
    weak_answer_patterns: list[str]
    strong_answer_patterns: list[str]


class InterviewCurriculumOut(BaseModel):
    track_id: str
    track_title: str
    track_description: str
    topics: list[CurriculumTopicOut]
    ml_profile_detected: bool = False


class ResumeVersionOut(BaseModel):
    id: int
    kind: str
    title: str
    profile_id: int | None = None
    job_id: int | None = None
    model_served: str | None = None
    provider_served: str | None = None
    has_html: bool = False
    has_structured: bool = False
    created_at: str = ""
    html_content: str | None = None


class ResumeDesignOut(BaseModel):
    version_id: int
    html_content: str
    name: str = ""
    title: str = ""
    model_served: str | None = None
    provider_served: str | None = None
    tailored_to_job: bool = False
    job_title: str = ""
    job_company: str = ""
