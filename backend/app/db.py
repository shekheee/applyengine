from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine

from app.config import get_settings

settings = get_settings()

# Managed Postgres providers often hand out "postgres://" URLs, but SQLAlchemy
# expects the "postgresql://" scheme.
database_url = settings.database_url
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)

is_sqlite = database_url.startswith("sqlite")
connect_args = {"check_same_thread": False} if is_sqlite else {}
engine = create_engine(
    database_url,
    echo=False,
    connect_args=connect_args,
    # Recycle connections so a slept free-tier Postgres doesn't hand back a dead one.
    pool_pre_ping=not is_sqlite,
)


def init_db() -> None:
    # Import models so SQLModel registers the tables before create_all.
    from app import models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    _migrate_chat_attachments()
    _migrate_profile_base()
    _migrate_interview_overall_score()
    _migrate_interview_curriculum_topic()
    _migrate_conversations()
    _migrate_resume_versions()


def _migrate_resume_versions() -> None:
    """Create resumeversion table for saved base/designed resume outputs."""
    from sqlalchemy import text

    with engine.begin() as conn:
        if is_sqlite:
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS resumeversion (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        kind TEXT DEFAULT 'designed',
                        title TEXT DEFAULT '',
                        profile_id INTEGER,
                        job_id INTEGER,
                        html_content TEXT DEFAULT '',
                        structured_json JSON DEFAULT '{}',
                        model_served TEXT DEFAULT '',
                        provider_served TEXT DEFAULT '',
                        created_at TEXT,
                        FOREIGN KEY(user_id) REFERENCES user(id),
                        FOREIGN KEY(profile_id) REFERENCES profile(id),
                        FOREIGN KEY(job_id) REFERENCES job(id)
                    )
                    """
                )
            )
        else:
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS resumeversion (
                        id SERIAL PRIMARY KEY,
                        user_id INTEGER NOT NULL REFERENCES "user"(id),
                        kind TEXT DEFAULT 'designed',
                        title TEXT DEFAULT '',
                        profile_id INTEGER REFERENCES profile(id),
                        job_id INTEGER REFERENCES job(id),
                        html_content TEXT DEFAULT '',
                        structured_json JSON DEFAULT '{}'::json,
                        model_served TEXT DEFAULT '',
                        provider_served TEXT DEFAULT '',
                        created_at TIMESTAMPTZ
                    )
                    """
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_resumeversion_user_id "
                    "ON resumeversion (user_id)"
                )
            )


def _migrate_chat_attachments() -> None:
    """Add attachments JSON column to existing chatmessage tables (Postgres)."""
    if is_sqlite:
        return
    from sqlalchemy import text

    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE chatmessage ADD COLUMN IF NOT EXISTS attachments JSON "
                "DEFAULT '[]'::json"
            )
        )


def _migrate_profile_base() -> None:
    """Add is_base + source_filename columns for canonical resume tracking."""
    if is_sqlite:
        return
    from sqlalchemy import text

    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE profile ADD COLUMN IF NOT EXISTS is_base BOOLEAN "
                "DEFAULT TRUE"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE profile ADD COLUMN IF NOT EXISTS source_filename "
                "TEXT DEFAULT ''"
            )
        )


def _migrate_interview_overall_score() -> None:
    """Add overall_score column for cross-session progress queries."""
    if is_sqlite:
        return
    from sqlalchemy import text

    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE interviewsession ADD COLUMN IF NOT EXISTS overall_score "
                "DOUBLE PRECISION"
            )
        )
        # Backfill from summary JSON where possible
        conn.execute(
            text(
                """
                UPDATE interviewsession
                SET overall_score = (summary->>'overall_score')::double precision
                WHERE overall_score IS NULL
                  AND summary IS NOT NULL
                  AND summary->>'overall_score' ~ '^[0-9]+(\\.[0-9]+)?$'
                """
            )
        )


def _migrate_interview_curriculum_topic() -> None:
    """Add curriculum_topic column for AI/ML engineering prep track."""
    from sqlalchemy import text

    with engine.begin() as conn:
        if is_sqlite:
            try:
                conn.execute(
                    text(
                        "ALTER TABLE interviewsession ADD COLUMN curriculum_topic "
                        "TEXT DEFAULT ''"
                    )
                )
            except Exception:
                pass  # column already exists
        else:
            conn.execute(
                text(
                    "ALTER TABLE interviewsession ADD COLUMN IF NOT EXISTS curriculum_topic "
                    "TEXT DEFAULT ''"
                )
            )


def _migrate_conversations() -> None:
    """Add Conversation table, scope messages, migrate legacy single-thread data."""
    from sqlalchemy import text

    with engine.begin() as conn:
        if is_sqlite:
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS conversation (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        title TEXT DEFAULT 'New conversation',
                        job_id INTEGER,
                        jd_text TEXT DEFAULT '',
                        created_at TEXT,
                        updated_at TEXT,
                        FOREIGN KEY(user_id) REFERENCES user(id),
                        FOREIGN KEY(job_id) REFERENCES job(id)
                    )
                    """
                )
            )
            try:
                conn.execute(
                    text(
                        "ALTER TABLE chatmessage ADD COLUMN conversation_id INTEGER"
                    )
                )
            except Exception:
                pass
        else:
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS conversation (
                        id SERIAL PRIMARY KEY,
                        user_id INTEGER NOT NULL REFERENCES "user"(id),
                        title TEXT DEFAULT 'New conversation',
                        job_id INTEGER REFERENCES job(id),
                        jd_text TEXT DEFAULT '',
                        created_at TIMESTAMPTZ,
                        updated_at TIMESTAMPTZ
                    )
                    """
                )
            )
            conn.execute(
                text(
                    "ALTER TABLE chatmessage ADD COLUMN IF NOT EXISTS conversation_id "
                    "INTEGER REFERENCES conversation(id)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_chatmessage_conversation_id "
                    "ON chatmessage (conversation_id)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_conversation_user_id "
                    "ON conversation (user_id)"
                )
            )

    # Backfill: one "General" conversation per user with orphan messages
    from sqlmodel import Session, select

    from app.models import ChatMessage, Conversation, User

    with Session(engine) as session:
        users = session.exec(select(User)).all()
        for user in users:
            if user.id is None:
                continue
            orphan = session.exec(
                select(ChatMessage).where(
                    ChatMessage.user_id == user.id,
                    ChatMessage.conversation_id.is_(None),  # type: ignore[union-attr]
                )
            ).all()
            if not orphan:
                continue
            general = session.exec(
                select(Conversation).where(
                    Conversation.user_id == user.id,
                    Conversation.title == "General",
                )
            ).first()
            if not general:
                general = Conversation(user_id=user.id, title="General")
                session.add(general)
                session.commit()
                session.refresh(general)
            for msg in orphan:
                msg.conversation_id = general.id
                session.add(msg)
            session.commit()


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
