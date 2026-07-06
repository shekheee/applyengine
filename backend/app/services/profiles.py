from __future__ import annotations

from sqlmodel import Session, select

from app.models import Profile, User


def get_base_profile(user: User, session: Session) -> Profile | None:
    """Return the user's canonical base resume profile (most recent user upload)."""
    base = session.exec(
        select(Profile)
        .where(Profile.user_id == user.id, Profile.is_base == True)  # noqa: E712
        .order_by(Profile.id.desc())
    ).first()
    if base:
        return base
    # Back-compat: profiles created before is_base existed.
    return session.exec(
        select(Profile).where(Profile.user_id == user.id).order_by(Profile.id.desc())
    ).first()
