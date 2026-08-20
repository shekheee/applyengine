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
    _migrate_chat_routing()
    _migrate_profile_base()
    _migrate_interview_overall_score()
    _migrate_interview_curriculum_topic()
    _migrate_conversations()
    _migrate_conversation_context()
    _migrate_resume_versions()
    _migrate_interview_live_mode()
    _migrate_interview_reliability()
    _migrate_social_studio()
    _migrate_buddy_practice()


def _migrate_buddy_practice() -> None:
    """Create persistent Buddy sessions and vocabulary for existing databases."""
    from sqlalchemy import text

    with engine.begin() as conn:
        if is_sqlite:
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS buddysession (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        conversation_id INTEGER,
                        topic TEXT DEFAULT 'Open technical conversation',
                        goal TEXT DEFAULT 'Explain one idea clearly and concisely',
                        target_minutes INTEGER DEFAULT 10,
                        spoken_seconds FLOAT DEFAULT 0,
                        turn_count INTEGER DEFAULT 0,
                        words_spoken INTEGER DEFAULT 0,
                        status TEXT DEFAULT 'active',
                        started_at TEXT,
                        completed_at TEXT,
                        updated_at TEXT,
                        FOREIGN KEY(user_id) REFERENCES user(id),
                        FOREIGN KEY(conversation_id) REFERENCES conversation(id)
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS vocabularyterm (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        term TEXT NOT NULL,
                        meaning TEXT DEFAULT '',
                        example TEXT DEFAULT '',
                        source TEXT DEFAULT 'manual',
                        times_practised INTEGER DEFAULT 0,
                        confidence INTEGER DEFAULT 0,
                        last_practised_at TEXT,
                        created_at TEXT,
                        updated_at TEXT,
                        FOREIGN KEY(user_id) REFERENCES user(id)
                    )
                    """
                )
            )
        else:
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS buddysession (
                        id SERIAL PRIMARY KEY,
                        user_id INTEGER NOT NULL REFERENCES "user"(id),
                        conversation_id INTEGER REFERENCES conversation(id),
                        topic TEXT DEFAULT 'Open technical conversation',
                        goal TEXT DEFAULT 'Explain one idea clearly and concisely',
                        target_minutes INTEGER DEFAULT 10,
                        spoken_seconds DOUBLE PRECISION DEFAULT 0,
                        turn_count INTEGER DEFAULT 0,
                        words_spoken INTEGER DEFAULT 0,
                        status TEXT DEFAULT 'active',
                        started_at TIMESTAMPTZ,
                        completed_at TIMESTAMPTZ,
                        updated_at TIMESTAMPTZ
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS vocabularyterm (
                        id SERIAL PRIMARY KEY,
                        user_id INTEGER NOT NULL REFERENCES "user"(id),
                        term TEXT NOT NULL,
                        meaning TEXT DEFAULT '',
                        example TEXT DEFAULT '',
                        source TEXT DEFAULT 'manual',
                        times_practised INTEGER DEFAULT 0,
                        confidence INTEGER DEFAULT 0,
                        last_practised_at TIMESTAMPTZ,
                        created_at TIMESTAMPTZ,
                        updated_at TIMESTAMPTZ
                    )
                    """
                )
            )
        for table, column in (
            ("buddysession", "user_id"),
            ("buddysession", "conversation_id"),
            ("buddysession", "status"),
            ("vocabularyterm", "user_id"),
            ("vocabularyterm", "term"),
        ):
            conn.execute(
                text(
                    f"CREATE INDEX IF NOT EXISTS ix_{table}_{column} "
                    f"ON {table} ({column})"
                )
            )


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


def _migrate_chat_routing() -> None:
    """Persist which requested or backup model served each Coach response."""
    from sqlalchemy import text

    columns = (
        "requested_model TEXT DEFAULT ''",
        "model_served TEXT DEFAULT ''",
        "provider_served TEXT DEFAULT ''",
        "fallback_used BOOLEAN DEFAULT FALSE",
        "fallback_reason TEXT DEFAULT ''",
        "reasoning_effort TEXT DEFAULT ''",
    )
    with engine.begin() as conn:
        if is_sqlite:
            existing = {
                row[1]
                for row in conn.execute(text("PRAGMA table_info(chatmessage)"))
            }
            for definition in columns:
                column_name = definition.split()[0]
                if column_name not in existing:
                    conn.execute(text(f"ALTER TABLE chatmessage ADD COLUMN {definition}"))
            return
        for definition in columns:
            conn.execute(
                text(f"ALTER TABLE chatmessage ADD COLUMN IF NOT EXISTS {definition}")
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
        conn.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ux_profile_one_base_per_user "
                "ON profile (user_id) WHERE is_base = TRUE"
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


def _migrate_conversation_context() -> None:
    """Add provider-neutral rolling summaries for long Coach threads."""
    from sqlalchemy import text

    columns = (
        "context_summary TEXT DEFAULT ''",
        "summary_through_message_id INTEGER DEFAULT 0",
    )
    with engine.begin() as conn:
        if is_sqlite:
            existing = {
                row[1] for row in conn.execute(text("PRAGMA table_info(conversation)"))
            }
            for definition in columns:
                column_name = definition.split()[0]
                if column_name not in existing:
                    conn.execute(text(f"ALTER TABLE conversation ADD COLUMN {definition}"))
            return
        for definition in columns:
            conn.execute(
                text(f"ALTER TABLE conversation ADD COLUMN IF NOT EXISTS {definition}")
            )


def _migrate_interview_live_mode() -> None:
    """Add mode + live_state columns for live voice interview sessions."""
    from sqlalchemy import text

    with engine.begin() as conn:
        if is_sqlite:
            try:
                conn.execute(
                    text(
                        "ALTER TABLE interviewsession ADD COLUMN mode TEXT DEFAULT 'text'"
                    )
                )
            except Exception:
                pass
            try:
                conn.execute(
                    text(
                        "ALTER TABLE interviewsession ADD COLUMN live_state JSON DEFAULT '{}'"
                    )
                )
            except Exception:
                pass
        else:
            conn.execute(
                text(
                    "ALTER TABLE interviewsession ADD COLUMN IF NOT EXISTS mode "
                    "TEXT DEFAULT 'text'"
                )
            )
            conn.execute(
                text(
                    "ALTER TABLE interviewsession ADD COLUMN IF NOT EXISTS live_state "
                    "JSON DEFAULT '{}'::json"
                )
            )


def _migrate_interview_reliability() -> None:
    """Add resumable session controls and request-level idempotency."""
    from sqlalchemy import text

    session_columns = (
        "title TEXT DEFAULT ''",
        "archived BOOLEAN DEFAULT FALSE",
    )
    turn_columns = ("request_id TEXT DEFAULT ''",)
    with engine.begin() as conn:
        if is_sqlite:
            session_existing = {
                row[1] for row in conn.execute(text("PRAGMA table_info(interviewsession)"))
            }
            turn_existing = {
                row[1] for row in conn.execute(text("PRAGMA table_info(interviewturn)"))
            }
            for definition in session_columns:
                name = definition.split()[0]
                if name not in session_existing:
                    conn.execute(text(f"ALTER TABLE interviewsession ADD COLUMN {definition}"))
            for definition in turn_columns:
                name = definition.split()[0]
                if name not in turn_existing:
                    conn.execute(text(f"ALTER TABLE interviewturn ADD COLUMN {definition}"))
        else:
            for definition in session_columns:
                conn.execute(
                    text(f"ALTER TABLE interviewsession ADD COLUMN IF NOT EXISTS {definition}")
                )
            for definition in turn_columns:
                conn.execute(
                    text(f"ALTER TABLE interviewturn ADD COLUMN IF NOT EXISTS {definition}")
                )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_interviewsession_archived "
                "ON interviewsession (archived)"
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_interviewturn_request_id "
                "ON interviewturn (request_id)"
            )
        )
        conn.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ux_interviewturn_request_role "
                "ON interviewturn (session_id, request_id, role) "
                "WHERE request_id <> ''"
            )
        )


def _migrate_social_studio() -> None:
    """Create durable, user-scoped Social Studio projects and messages."""
    from sqlalchemy import text

    with engine.begin() as conn:
        if is_sqlite:
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS socialproject (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        platform TEXT DEFAULT 'linkedin',
                        title TEXT DEFAULT 'Untitled draft',
                        status TEXT DEFAULT 'draft',
                        settings JSON DEFAULT '{}',
                        current_content TEXT DEFAULT '',
                        created_at TEXT,
                        updated_at TEXT,
                        FOREIGN KEY(user_id) REFERENCES user(id)
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS socialmessage (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        project_id INTEGER NOT NULL,
                        role TEXT DEFAULT 'user',
                        content TEXT DEFAULT '',
                        created_at TEXT,
                        FOREIGN KEY(user_id) REFERENCES user(id),
                        FOREIGN KEY(project_id) REFERENCES socialproject(id)
                    )
                    """
                )
            )
        else:
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS socialproject (
                        id SERIAL PRIMARY KEY,
                        user_id INTEGER NOT NULL REFERENCES "user"(id),
                        platform TEXT DEFAULT 'linkedin',
                        title TEXT DEFAULT 'Untitled draft',
                        status TEXT DEFAULT 'draft',
                        settings JSON DEFAULT '{}'::json,
                        current_content TEXT DEFAULT '',
                        created_at TIMESTAMPTZ,
                        updated_at TIMESTAMPTZ
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS socialmessage (
                        id SERIAL PRIMARY KEY,
                        user_id INTEGER NOT NULL REFERENCES "user"(id),
                        project_id INTEGER NOT NULL REFERENCES socialproject(id),
                        role TEXT DEFAULT 'user',
                        content TEXT DEFAULT '',
                        created_at TIMESTAMPTZ
                    )
                    """
                )
            )
        for table, column in (
            ("socialproject", "user_id"),
            ("socialproject", "platform"),
            ("socialproject", "status"),
            ("socialmessage", "user_id"),
            ("socialmessage", "project_id"),
        ):
            conn.execute(
                text(
                    f"CREATE INDEX IF NOT EXISTS ix_{table}_{column} "
                    f"ON {table} ({column})"
                )
            )


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
