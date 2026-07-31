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
        return normalize_profile(base)
    # Back-compat: profiles created before is_base existed.
    legacy = session.exec(
        select(Profile).where(Profile.user_id == user.id).order_by(Profile.id.desc())
    ).first()
    return normalize_profile(legacy) if legacy else None


def normalize_profile(profile: Profile) -> Profile:
    """Coalesce NULL JSON list columns from legacy rows into empty lists."""
    if profile.links is None:
        profile.links = []
    if profile.skills is None:
        profile.skills = []
    if profile.experience is None:
        profile.experience = []
    if profile.projects is None:
        profile.projects = []
    if profile.education is None:
        profile.education = []
    return profile
