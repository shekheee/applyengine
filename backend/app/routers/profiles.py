from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlmodel import Session, select

from app.auth import get_current_user
from app.db import get_session
from app.models import Profile, User
from app.schemas import ResumeTextIn
from app.services.parsing import parse_resume
from app.services.profiles import get_base_profile
from app.services.text_extract import extract_text

router = APIRouter(prefix="/api/profiles", tags=["profiles"])

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md"}
MIN_EXTRACTED_CHARS = 80


def _validate_upload(filename: str, data: bytes) -> None:
    name = (filename or "").lower()
    ext = next((e for e in ALLOWED_EXTENSIONS if name.endswith(e)), None)
    if not ext:
        raise HTTPException(
            400,
            "Unsupported file type. Upload a PDF, DOCX, or TXT resume.",
        )
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(400, "File too large (max 5 MB).")
    if len(data) == 0:
        raise HTTPException(400, "File is empty.")


def _create_base_profile(
    raw_text: str,
    user: User,
    session: Session,
    *,
    source_filename: str = "",
) -> Profile:
    if len(raw_text.strip()) < MIN_EXTRACTED_CHARS:
        raise HTTPException(
            400,
            "Could not extract enough text from that file. "
            "Try a text-based PDF or DOCX, or paste your resume instead.",
        )
    try:
        parsed = parse_resume(raw_text)
    except Exception as exc:
        raise HTTPException(
            400,
            "Failed to parse resume content. Try a different file or paste the text.",
        ) from exc

    if not any(
        [
            parsed.get("name"),
            parsed.get("experience"),
            parsed.get("skills"),
            parsed.get("summary"),
            len(raw_text.strip()) >= MIN_EXTRACTED_CHARS,
        ]
    ):
        raise HTTPException(
            400,
            "That file doesn't look like a resume. Upload a PDF or DOCX with your experience.",
        )

    profile = Profile(
        user_id=user.id,
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
        is_base=True,
        source_filename=source_filename,
    )
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return profile


@router.post("", response_model=Profile)
def create_profile_from_text(
    body: ResumeTextIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Paste resume text as the canonical base profile."""
    if not body.raw_text.strip():
        raise HTTPException(400, "Resume text is empty")
    return _create_base_profile(body.raw_text, user, session, source_filename="pasted.txt")


@router.post("/upload", response_model=Profile)
async def upload_base_resume(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Upload a resume file (PDF/DOCX/TXT) as the canonical base profile."""
    data = await file.read()
    filename = file.filename or "resume.pdf"
    _validate_upload(filename, data)
    try:
        raw_text = extract_text(filename, data)
    except Exception as exc:
        raise HTTPException(
            400,
            f"Could not read '{filename}'. Ensure it is a valid PDF or DOCX file.",
        ) from exc
    return _create_base_profile(raw_text, user, session, source_filename=filename)


@router.get("/base", response_model=Profile)
def base_profile(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Return the user's canonical base resume profile."""
    p = get_base_profile(user, session)
    if not p:
        raise HTTPException(404, "No base resume yet — upload your resume first.")
    return p


@router.get("", response_model=list[Profile])
def list_profiles(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    return session.exec(
        select(Profile)
        .where(Profile.user_id == user.id)
        .order_by(Profile.created_at.desc())
    ).all()


@router.get("/latest", response_model=Profile)
def latest_profile(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Alias for the canonical base profile."""
    p = get_base_profile(user, session)
    if not p:
        raise HTTPException(404, "No base resume yet — upload your resume first.")
    return p


@router.get("/{profile_id}", response_model=Profile)
def get_profile(
    profile_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    p = session.get(Profile, profile_id)
    if not p or p.user_id != user.id:
        raise HTTPException(404, "Profile not found")
    return p
