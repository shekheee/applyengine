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


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
