from __future__ import annotations

import datetime as dt
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.models import ApplicationStatus


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


class BuddySessionCreate(BaseModel):
    conversation_id: int | None = None
    topic: str = Field(default="Open technical conversation", max_length=160)
    goal: str = Field(
        default="Explain one idea clearly and concisely", max_length=300
    )
    target_minutes: int = Field(default=10, ge=1, le=30)


class BuddySessionUpdate(BaseModel):
    spoken_seconds_delta: float = Field(default=0, ge=0, le=1800)
    words_spoken_delta: int = Field(default=0, ge=0, le=10000)
    turn_count_delta: int = Field(default=0, ge=0, le=100)
    status: str | None = None


class BuddyTurnIn(BaseModel):
    conversation_id: int
    session_id: int | None = None
    role: str
    content: str = Field(min_length=1, max_length=50000)
    duration_seconds: float = Field(default=0, ge=0, le=1800)
    word_count: int = Field(default=0, ge=0, le=10000)


class VocabularyCreate(BaseModel):
    term: str = Field(min_length=1, max_length=120)
    meaning: str = Field(default="", max_length=1000)
    example: str = Field(default="", max_length=1500)
    source: str = Field(default="manual", max_length=30)


class VocabularyUpdate(BaseModel):
    term: str | None = Field(default=None, min_length=1, max_length=120)
    meaning: str | None = Field(default=None, max_length=1000)
    example: str | None = Field(default=None, max_length=1500)
    confidence: int | None = Field(default=None, ge=0, le=5)
    practise: bool = False


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
    case_id: str = ""  # DS business-case bank id; "" for a standard interview


class InterviewCaseTranscriptIn(BaseModel):
    case_id: str
    transcript: str
    duration_seconds: float | None = None


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


class InterviewRealtimeTurnIn(BaseModel):
    role: str  # candidate | interviewer
    content: str
    request_id: str = ""
    duration_seconds: float = 0
    latency_ms: int | None = None


class InterviewRealtimeErrorIn(BaseModel):
    code: str = Field(default="realtime_error", max_length=120)
    message: str = Field(default="Unknown realtime error", max_length=1000)
    param: str = Field(default="", max_length=240)
    event_id: str = Field(default="", max_length=160)
    event_type: str = Field(default="error", max_length=120)


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
    capture_quality: dict[str, Any] = {}
    audio_analysis: dict[str, Any] = {}


class TranscribeOut(BaseModel):
    text: str
    duration_seconds: float = 0
    delivery: DeliveryMetricsOut
    model: str = "gpt-4o-transcribe"
    fallback_used: bool = False


class AudioDeliveryAnalysisOut(BaseModel):
    status: str = "unavailable"
    provider: str = "gemini"
    model: str = ""
    summary: str = ""
    scores: dict[str, int] = {}
    strengths: list[str] = []
    improvements: list[str] = []
    concise_tip: str = ""


class InterviewDeliveryUpdateIn(BaseModel):
    delivery: dict[str, Any]


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


# ---------------------------------------------------------------------------
# Interview Prep
# ---------------------------------------------------------------------------


class PrepSettingsIn(BaseModel):
    start_date: dt.date
    hours_per_week: int = Field(default=25, ge=1, le=80)


class PrepSettingsOut(BaseModel):
    configured: bool
    start_date: dt.date | None = None
    hours_per_week: int = 25


class PrepCheckIn(BaseModel):
    """Tick or untick a checklist item from the Today screen."""

    task_id: str
    date: dt.date
    done: bool
    redo_id: int | None = None


class PrepItemOut(BaseModel):
    key: str
    task_id: str
    type: str
    title: str
    url: str | None = None
    pattern: str | None = None
    slot: str
    week: int
    target_minutes: int
    stretch: bool = False
    difficulty: str | None = None
    badge: str | None = None
    done: bool
    redo_id: int | None = None
    due_date: str | None = None
    reason: str | None = None


class PrepStreakOut(BaseModel):
    current: int
    best: int
    today_count: int
    needed_today: int


class PrepDayOut(BaseModel):
    date: str
    label: str
    status: str  # done | partial | missed | today | upcoming
    count: int


class PrepProgressOut(BaseModel):
    done: int
    total: int


class PrepFeedbackOut(BaseModel):
    date: dt.date
    markdown: str
    created_at: datetime


class PrepTodayOut(BaseModel):
    configured: bool
    program_name: str
    doc_url: str | None = None
    date: dt.date
    status: str = "unconfigured"  # unconfigured | not_started | active | complete
    week: int = 0
    weeks: int = 10
    weekday: str = ""
    start_date: str | None = None
    days_until_start: int = 0
    morning: list[PrepItemOut] = Field(default_factory=list)
    evening: list[PrepItemOut] = Field(default_factory=list)
    weekend: list[PrepItemOut] = Field(default_factory=list)
    carried: list[PrepItemOut] = Field(default_factory=list)
    redos: list[PrepItemOut] = Field(default_factory=list)
    extra: list[PrepItemOut] = Field(default_factory=list)
    dsa_backlog: int = 0
    done_count: int = 0
    total_count: int = 0
    streak: PrepStreakOut | None = None
    week_strip: list[PrepDayOut] = Field(default_factory=list)
    week_progress: PrepProgressOut | None = None
    feedback: PrepFeedbackOut | None = None


class PrepAttemptIn(BaseModel):
    task_id: str
    date: dt.date
    title: str = Field(default="", max_length=300)
    started_at: datetime | None = None
    ended_at: datetime | None = None
    elapsed_minutes: float = Field(default=0, ge=0, le=24 * 60)
    hint_used: bool = False
    solved: Literal["yes", "partial", "no"] = "yes"
    self_rating: int | None = Field(default=None, ge=1, le=5)
    code: str = Field(default="", max_length=200_000)
    notes: str = Field(default="", max_length=20_000)
    complexity: str = Field(default="", max_length=300)


class PrepAttemptOut(BaseModel):
    id: int
    task_id: str
    title: str
    date: dt.date
    started_at: datetime | None = None
    ended_at: datetime | None = None
    elapsed_minutes: float
    hint_used: bool
    solved: str
    self_rating: int | None = None
    code: str
    notes: str
    complexity: str


class PrepRedoOut(BaseModel):
    id: int
    task_id: str
    due_date: dt.date
    reason: str
    done: bool


class PrepAttemptResultOut(BaseModel):
    attempt: PrepAttemptOut
    redos_created: list[PrepRedoOut] = Field(default_factory=list)
    redos_cleared: int = 0


class PrepTaskDetailOut(BaseModel):
    id: str
    type: str
    week: int
    day: str | None = None
    slot: str
    title: str
    url: str | None = None
    pattern: str | None = None
    spec: str | None = None
    extensions: str | None = None
    framework: list[str] | None = None
    target_minutes: int
    stretch: bool = False
    editor: bool = False
    synthetic: bool = False
    rules: dict[str, Any] = Field(default_factory=dict)
    attempts: list[PrepAttemptOut] = Field(default_factory=list)
    open_redos: list[PrepRedoOut] = Field(default_factory=list)
    brief: str | None = None
    starter: str | None = None
    tests: list[dict[str, str]] = Field(default_factory=list)
    hints_total: int = 0
    hints_revealed: list[str] = Field(default_factory=list)
    # The reference solution unlocks once the task has a logged attempt.
    solution: str | None = None
    solution_locked: bool = False


class PrepPlanTaskOut(BaseModel):
    task_id: str
    type: str
    title: str
    url: str | None = None
    pattern: str | None = None
    day: str | None = None
    slot: str
    target_minutes: int
    stretch: bool = False
    status: str  # todo | done | redo
    attempts: int = 0
    last_date: str | None = None
    last_minutes: int | None = None
    last_hint: bool | None = None
    last_solved: str | None = None
    next_redo: str | None = None


class PrepPlanWeekOut(BaseModel):
    week: int
    start_date: str | None = None
    tasks: list[PrepPlanTaskOut]
    done: int


class PrepPlanOut(BaseModel):
    configured: bool
    current_week: int
    weeks: list[PrepPlanWeekOut]


class PrepReviewTokenOut(BaseModel):
    exists: bool
    created_at: datetime | None = None
    last_used_at: datetime | None = None
    token: str | None = None  # Only set in the response that creates it.


class PrepHintRevealIn(BaseModel):
    date: dt.date


class PrepHintsOut(BaseModel):
    total: int
    revealed: list[str]


class PrepTutorMessageOut(BaseModel):
    id: int
    role: str
    content: str
    model_served: str = ""
    created_at: datetime


class PrepTutorIn(BaseModel):
    """Empty `message` asks for the attempt review; otherwise it is a follow-up question."""

    message: str = Field(default="", max_length=8_000)
    model: str | None = None
