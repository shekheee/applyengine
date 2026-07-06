from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlmodel import Session, select

from app.auth import get_current_user
from app.db import get_session
from app.models import Memory, Profile, User
from app.services.resume_pdf import build_resume_pdf

router = APIRouter(prefix="/api/resume", tags=["resume"])


def _latest_profile(user: User, session: Session) -> Profile | None:
    return session.exec(
        select(Profile).where(Profile.user_id == user.id).order_by(Profile.id.desc())
    ).first()


def _user_memories(user: User, session: Session) -> list[Memory]:
    return session.exec(
        select(Memory).where(Memory.user_id == user.id).order_by(Memory.id.asc())
    ).all()


@router.get("/pdf")
def download_resume_pdf(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Generate and download a polished PDF resume from the user's profile + coach memory."""
    profile = _latest_profile(user, session)
    memories = _user_memories(user, session)
    try:
        pdf_bytes, filename = build_resume_pdf(profile, memories)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(
            status_code=500, detail="Failed to generate resume PDF."
        ) from e

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )
