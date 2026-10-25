import datetime as dt
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
    fit_version: str = "1.0"
    fit_breakdown: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
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
    context_summary: str = Field(default="", sa_column=Column(Text))
    summary_through_message_id: int = 0
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
    requested_model: str = ""
    model_served: str = ""
    provider_served: str = ""
    fallback_used: bool = False
    fallback_reason: str = ""
    reasoning_effort: str = ""
    created_at: datetime = Field(default_factory=_now)


class SocialProject(SQLModel, table=True):
    """A user-owned LinkedIn or Medium drafting workspace."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    platform: str = Field(default="linkedin", index=True)
    title: str = "Untitled draft"
    status: str = Field(default="draft", index=True)
    settings: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    current_content: str = Field(default="", sa_column=Column(Text))
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class SocialMessage(SQLModel, table=True):
    """A conversational turn within a social drafting project."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    project_id: int = Field(foreign_key="socialproject.id", index=True)
    role: str = "user"
    content: str = Field(default="", sa_column=Column(Text))
    created_at: datetime = Field(default_factory=_now)


class Memory(SQLModel, table=True):
    """A durable fact the coach has learned about the user."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    kind: str = "fact"  # e.g. skill | experience | preference | goal | achievement | fact
    content: str = Field(default="", sa_column=Column(Text))
    created_at: datetime = Field(default_factory=_now)


class BuddySession(SQLModel, table=True):
    """A guided speaking session for the Technical Buddy."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    conversation_id: int | None = Field(
        default=None, foreign_key="conversation.id", index=True
    )
    topic: str = "Open technical conversation"
    goal: str = "Explain one idea clearly and concisely"
    target_minutes: int = 10
    spoken_seconds: float = 0
    turn_count: int = 0
    words_spoken: int = 0
    status: str = Field(default="active", index=True)  # active | completed
    started_at: datetime = Field(default_factory=_now)
    completed_at: datetime | None = None
    updated_at: datetime = Field(default_factory=_now)


class VocabularyTerm(SQLModel, table=True):
    """A word or phrase the user wants to make active in speech."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    term: str = Field(index=True)
    meaning: str = Field(default="", sa_column=Column(Text))
    example: str = Field(default="", sa_column=Column(Text))
    source: str = "manual"
    times_practised: int = 0
    confidence: int = 0
    last_practised_at: datetime | None = None
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class InterviewSession(SQLModel, table=True):
    """An interview practice session tailored to the user's resume and optional job."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    job_id: int | None = Field(default=None, foreign_key="job.id", index=True)
    title: str = ""
    archived: bool = Field(default=False, index=True)
    focus: str = "mixed"  # behavioral | role_technical | case_study | leadership_stakeholder | resume_deep_dive | mixed
    difficulty: str = "mid"  # junior | mid | senior
    curriculum_topic: str = ""  # "" | all | ml_classics | llm_fundamentals | ... (AI/ML track)
    mode: str = "text"  # text | live
    live_state: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    status: str = "active"  # active | completed
    questions: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    current_index: int = 0
    summary: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    recurring_weaknesses: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    overall_score: float | None = None
    model_id: str = ""
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class ResumeVersionKind(str, Enum):
    base = "base"
    designed = "designed"


class ResumeVersion(SQLModel, table=True):
    """Saved resume output — base upload snapshot or AI-designed HTML."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    kind: str = Field(default=ResumeVersionKind.designed.value, index=True)
    title: str = ""
    profile_id: int | None = Field(default=None, foreign_key="profile.id", index=True)
    job_id: int | None = Field(default=None, foreign_key="job.id", index=True)
    html_content: str = Field(default="", sa_column=Column(Text))
    structured_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    model_served: str = ""
    provider_served: str = ""
    created_at: datetime = Field(default_factory=_now)


class SkillArtifact(SQLModel, table=True):
    """A versioned output created by an ApplyEngine skill."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    skill_id: str = Field(index=True)
    title: str = "Untitled artifact"
    template: str = ""
    job_id: int | None = Field(default=None, foreign_key="job.id", index=True)
    parent_id: int | None = Field(default=None, foreign_key="skillartifact.id", index=True)
    brief: str = Field(default="", sa_column=Column(Text))
    content_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    requested_model: str = ""
    model_served: str = ""
    provider_served: str = ""
    created_at: datetime = Field(default_factory=_now)


class InterviewTurn(SQLModel, table=True):
    """A single turn within an interview practice session."""

    id: int | None = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="interviewsession.id", index=True)
    request_id: str = Field(default="", index=True)
    question_index: int = 0
    role: str = "candidate"  # candidate | feedback | followup | interviewer | followup_reply
    content: str = Field(default="", sa_column=Column(Text))
    scores: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=_now)


class PrepTask(SQLModel, table=True):
    """One task from the Interview Prep program seed; shared by every user."""

    id: str = Field(primary_key=True)
    type: str = Field(index=True)  # dsa | drill | lld | hld | python | project
    week: int = Field(index=True)
    order: int = 0
    day: str | None = None  # Mon..Sun for weekday-bound tasks
    # morning | evening | weekend | weekly (challenge/fundamentals) | extra (optional)
    slot: str = "morning"
    title: str = ""
    url: str | None = None
    pattern: str | None = None
    spec: str | None = Field(default=None, sa_column=Column(Text))
    extensions: str | None = Field(default=None, sa_column=Column(Text))
    framework: list[str] | None = Field(default=None, sa_column=Column(JSON))
    target_minutes: int = 30
    stretch: bool = False
    editor: bool = False
    difficulty: str | None = None  # easy | medium | hard, for the optional extra bank
    # Authored study content from data/prep_content/*.json.
    statement: str | None = Field(default=None, sa_column=Column(Text))  # DSA problem text
    brief: str | None = Field(default=None, sa_column=Column(Text))
    learn: str | None = Field(default=None, sa_column=Column(Text))  # optional background
    starter: str | None = Field(default=None, sa_column=Column(Text))
    tests: list[dict[str, Any]] | None = Field(default=None, sa_column=Column(JSON))
    hints: list[str] | None = Field(default=None, sa_column=Column(JSON))
    solution: str | None = Field(default=None, sa_column=Column(Text))
    # Progressive challenges: [{"title", "brief", "tests"}] per level.
    levels: list[dict[str, Any]] | None = Field(default=None, sa_column=Column(JSON))


class PrepSettings(SQLModel, table=True):
    """A user's Interview Prep program settings."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True, unique=True)
    start_date: dt.date
    hours_per_week: int = 25
    updated_at: datetime = Field(default_factory=_now)


class PrepAttempt(SQLModel, table=True):
    """A logged attempt at a prep task. `date` is the user's local calendar day."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    # Not a foreign key: weeks 9-10 log free NeetCode problems as nc-YYYY-MM-DD.
    task_id: str = Field(index=True)
    title: str = ""
    date: dt.date = Field(index=True)
    started_at: datetime | None = None
    ended_at: datetime | None = None
    elapsed_minutes: float = 0
    hint_used: bool = False
    solved: str = "yes"  # yes | partial | no
    self_rating: int | None = None
    code: str = Field(default="", sa_column=Column(Text))
    notes: str = Field(default="", sa_column=Column(Text))
    complexity: str = ""
    # Whiteboard elements (Excalidraw JSON) for design attempts.
    diagram: list[dict[str, Any]] | None = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=_now)


class PrepRedo(SQLModel, table=True):
    """A scheduled re-attempt of a task the user struggled with."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    task_id: str = Field(index=True)
    due_date: dt.date = Field(index=True)
    reason: str = ""
    done: bool = Field(default=False, index=True)
    completed_on: dt.date | None = None
    source_attempt_id: int | None = Field(default=None, foreign_key="prepattempt.id")
    created_at: datetime = Field(default_factory=_now)


class PrepFeedback(SQLModel, table=True):
    """Written review of one prep day, produced by the daily Claude review."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    date: dt.date = Field(index=True)
    markdown: str = Field(default="", sa_column=Column(Text))
    created_at: datetime = Field(default_factory=_now)


class PrepReviewToken(SQLModel, table=True):
    """Long-lived token the nightly review script uses; only reaches prep log/feedback."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True, unique=True)
    token_hash: str = Field(index=True, unique=True)
    created_at: datetime = Field(default_factory=_now)
    last_used_at: datetime | None = None


class PrepHintReveal(SQLModel, table=True):
    """A hint the user opened during a session; any reveal marks that day's attempt."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    task_id: str = Field(index=True)
    date: dt.date = Field(index=True)
    level: int = 1
    revealed_at: datetime = Field(default_factory=_now)


class PrepTutorMessage(SQLModel, table=True):
    """The after-attempt review and follow-up questions, one thread per attempt."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    attempt_id: int = Field(foreign_key="prepattempt.id", index=True)
    role: str = "assistant"  # user | assistant
    content: str = Field(default="", sa_column=Column(Text))
    model_served: str = ""
    created_at: datetime = Field(default_factory=_now)


class PrepStory(SQLModel, table=True):
    """A behavioural story in STAR form, tagged with the competencies it shows."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    title: str = ""
    situation: str = Field(default="", sa_column=Column(Text))
    task: str = Field(default="", sa_column=Column(Text))
    action: str = Field(default="", sa_column=Column(Text))
    result: str = Field(default="", sa_column=Column(Text))
    tags: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    companies: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    # Ids of the question-bank prompts this story answers (e.g. "q-failure").
    questions: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    critique: str = Field(default="", sa_column=Column(Text))
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class PrepTarget(SQLModel, table=True):
    """A company the user is preparing for, with their own "why this company"."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    company: str = ""
    role: str = ""
    why: str = Field(default="", sa_column=Column(Text))
    questions: str = Field(default="", sa_column=Column(Text))
    updated_at: datetime = Field(default_factory=_now)


class PrepMock(SQLModel, table=True):
    """One mock interview and what to take from it."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    date: dt.date = Field(index=True)
    kind: str = "dsa"  # dsa | practical | lld | system_design | ml | behavioral
    company: str = ""
    platform: str = ""
    duration_minutes: int = 45
    score: int = 3  # 1-5
    went_well: str = Field(default="", sa_column=Column(Text))
    to_improve: str = Field(default="", sa_column=Column(Text))
    created_at: datetime = Field(default_factory=_now)


class PrepMockSession(SQLModel, table=True):
    """A live mock interview with the AI interviewer on one task."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    task_id: str = Field(index=True)
    date: dt.date = Field(index=True)
    status: str = "active"  # active | finished
    started_at: datetime = Field(default_factory=_now)
    ended_at: datetime | None = None
    elapsed_minutes: float = 0
    code: str = Field(default="", sa_column=Column(Text))
    scorecard: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    checkpoint_run_id: int | None = None
    mock_log_id: int | None = None


class PrepMockTurn(SQLModel, table=True):
    """One message in a mock interview."""

    id: int | None = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="prepmocksession.id", index=True)
    role: str  # interviewer | candidate
    content: str = Field(sa_column=Column(Text))
    created_at: datetime = Field(default_factory=_now)


class PrepCheckpointRun(SQLModel, table=True):
    """One timed, unassisted attempt at a readiness checkpoint."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    checkpoint_id: str = Field(index=True)
    task_id: str | None = None
    date: dt.date = Field(index=True)
    started_at: datetime = Field(default_factory=_now)
    finished_at: datetime | None = None
    passed: bool | None = None
    details: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
