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


class ChatEditIn(BaseModel):
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
    curriculum_topic: str = ""  # AI/ML track: "" | all | ml_classics | ...


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
    curriculum_topic: str = ""
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
