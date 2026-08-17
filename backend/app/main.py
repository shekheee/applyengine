from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import init_db
from app.prompts import PROMPTS_VERSION
from app.routers import (
    applications,
    auth,
    chat,
    generate,
    interview,
    jobs,
    profiles,
    resume,
    skills,
    social,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="ApplyEngine API", version="0.1.0", lifespan=lifespan)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin"],
    expose_headers=["Content-Type", "Cache-Control", "X-PDF-Engine", "X-PDF-Pages"],
    max_age=600,
)

app.include_router(auth.router)
app.include_router(profiles.router)
app.include_router(jobs.router)
app.include_router(applications.router)
app.include_router(generate.router)
app.include_router(chat.router)
app.include_router(resume.router)
app.include_router(interview.router)
app.include_router(skills.router)
app.include_router(social.router)


@app.get("/api/health")
def health():
    """Cheap liveness check; never initialize clients or perform external I/O."""
    return {
        "status": "ok",
        "llm_provider": settings.llm_provider,
        "prompts_version": PROMPTS_VERSION,
    }
