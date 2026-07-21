from __future__ import annotations

from datetime import datetime, timezone

from sqlmodel import Session, select

from app.models import Job, Profile, ResumeVersion, ResumeVersionKind, User
from app.services.resume_html import profile_to_base_html


def _now() -> datetime:
    return datetime.now(timezone.utc)


def version_title_for_base(profile: Profile) -> str:
    label = profile.source_filename or "Base resume"
    return f"Base upload · {label}"


def version_title_for_designed(
    job: Job | None, *, model: str | None = None
) -> str:
    when = _now().strftime("%b %d %Y")
    if job and (job.title or job.company):
        job_label = f"{job.title or 'Role'} @ {job.company or 'Company'}"
        title = f"Designed · {job_label} · {when}"
    else:
        title = f"Designed · General · {when}"
    if model:
        title += f" ({model})"
    return title


def list_user_versions(user: User, session: Session) -> list[ResumeVersion]:
    return session.exec(
        select(ResumeVersion)
        .where(ResumeVersion.user_id == user.id)
        .order_by(ResumeVersion.created_at.desc())
    ).all()


def get_user_version(
    user: User, version_id: int, session: Session
) -> ResumeVersion | None:
    version = session.get(ResumeVersion, version_id)
    if not version or version.user_id != user.id:
        return None
    return version


def ensure_base_version(
    user: User, profile: Profile, session: Session
) -> ResumeVersion:
    """Create or refresh the canonical base version for an uploaded profile."""
    existing = session.exec(
        select(ResumeVersion).where(
            ResumeVersion.user_id == user.id,
            ResumeVersion.kind == ResumeVersionKind.base.value,
            ResumeVersion.profile_id == profile.id,
        )
    ).first()
    html = profile_to_base_html(profile)
    title = version_title_for_base(profile)
    if existing:
        existing.title = title
        existing.html_content = html
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return existing

    version = ResumeVersion(
        user_id=user.id,
        kind=ResumeVersionKind.base.value,
        title=title,
        profile_id=profile.id,
        html_content=html,
        structured_json={},
    )
    session.add(version)
    session.commit()
    session.refresh(version)
    return version


def create_designed_version(
    user: User,
    session: Session,
    *,
    html_content: str,
    profile: Profile | None,
    job: Job | None,
    model_served: str | None,
    provider_served: str | None,
    structured_json: dict | None = None,
) -> ResumeVersion:
    version = ResumeVersion(
        user_id=user.id,
        kind=ResumeVersionKind.designed.value,
        title=version_title_for_designed(job, model=model_served),
        profile_id=profile.id if profile else None,
        job_id=job.id if job else None,
        html_content=html_content,
        structured_json=structured_json or {},
        model_served=model_served or "",
        provider_served=provider_served or "",
    )
    session.add(version)
    session.commit()
    session.refresh(version)
    return version


def version_to_api(version: ResumeVersion, *, include_html: bool = False) -> dict:
    out = {
        "id": version.id,
        "kind": version.kind,
        "title": version.title,
        "profile_id": version.profile_id,
        "job_id": version.job_id,
        "model_served": version.model_served or None,
        "provider_served": version.provider_served or None,
        "has_html": bool(version.html_content.strip()),
        "has_structured": bool(version.structured_json),
        "created_at": version.created_at.isoformat() if version.created_at else "",
    }
    if include_html:
        out["html_content"] = version.html_content
    return out
