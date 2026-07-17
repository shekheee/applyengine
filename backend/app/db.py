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


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
