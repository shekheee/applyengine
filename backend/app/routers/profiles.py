from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlmodel import Session, select

from app.db import get_session
from app.models import Profile
from app.schemas import ResumeTextIn
from app.services.parsing import parse_resume
from app.services.text_extract import extract_text

router = APIRouter(prefix="/api/profiles", tags=["profiles"])


def _create_from_text(raw_text: str, session: Session) -> Profile:
    if not raw_text.strip():
        raise HTTPException(400, "Resume text is empty")
    parsed = parse_resume(raw_text)
    profile = Profile(
        name=parsed.get("name", ""),
        email=parsed.get("email", ""),
        phone=parsed.get("phone", ""),
        location=parsed.get("location", ""),
        summary=parsed.get("summary", ""),
        raw_text=parsed.get("raw_text", raw_text),
        links=parsed.get("links", []),
        skills=parsed.get("skills", []),
        experience=parsed.get("experience", []),
        projects=parsed.get("projects", []),
        education=parsed.get("education", []),
    )
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return profile


@router.post("", response_model=Profile)
def create_profile_from_text(body: ResumeTextIn, session: Session = Depends(get_session)):
    return _create_from_text(body.raw_text, session)


@router.post("/upload", response_model=Profile)
async def create_profile_from_file(
    file: UploadFile = File(...), session: Session = Depends(get_session)
):
    data = await file.read()
    raw_text = extract_text(file.filename or "resume.txt", data)
    return _create_from_text(raw_text, session)


@router.get("", response_model=list[Profile])
def list_profiles(session: Session = Depends(get_session)):
    return session.exec(select(Profile).order_by(Profile.created_at.desc())).all()


@router.get("/latest", response_model=Profile)
def latest_profile(session: Session = Depends(get_session)):
    p = session.exec(select(Profile).order_by(Profile.id.desc())).first()
    if not p:
        raise HTTPException(404, "No profile yet")
    return p


@router.get("/{profile_id}", response_model=Profile)
def get_profile(profile_id: int, session: Session = Depends(get_session)):
    p = session.get(Profile, profile_id)
    if not p:
        raise HTTPException(404, "Profile not found")
    return p
