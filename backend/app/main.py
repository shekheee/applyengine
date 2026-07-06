from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import init_db
from app.llm import get_coach_provider, get_memory_provider, get_provider, resolved_memory_model_id
from app.prompts import PROMPTS_VERSION
from app.routers import applications, auth, chat, generate, jobs, profiles, resume


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
    expose_headers=["Content-Type", "Cache-Control"],
    max_age=600,
)

app.include_router(auth.router)
app.include_router(profiles.router)
app.include_router(jobs.router)
app.include_router(applications.router)
app.include_router(generate.router)
app.include_router(chat.router)
app.include_router(resume.router)


@app.get("/api/health")
def health():
    provider = get_provider()
    chat_model = getattr(provider, "chat_model", None) or getattr(
        provider, "_chat_model", None
    )
    coach_chain = None
    try:
        chain = get_coach_provider()
        coach_chain = {
            "providers": chain.chain_summary(),
            "last_served": chain.last_served,
        }
    except RuntimeError:
        coach_chain = {"providers": [], "last_served": None}

    memory_chain = None
    try:
        mem = get_memory_provider()
        memory_chain = {
            "model": resolved_memory_model_id(),
            "providers": mem.chain_summary(),
        }
    except RuntimeError:
        memory_chain = {"model": None, "providers": []}

    return {
        "status": "ok",
        "llm_provider": provider.name,
        "chat_model": chat_model,
        "coach_chain": coach_chain,
        "memory_chain": memory_chain,
        "prompts_version": PROMPTS_VERSION,
    }
