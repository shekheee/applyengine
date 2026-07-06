from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import init_db
from app.llm import get_provider
from app.prompts import PROMPTS_VERSION
from app.routers import applications, auth, chat, generate, jobs, profiles


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
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(profiles.router)
app.include_router(jobs.router)
app.include_router(applications.router)
app.include_router(generate.router)
app.include_router(chat.router)


@app.get("/api/health")
def health():
    provider = get_provider()
    chat_model = getattr(provider, "chat_model", None) or getattr(
        provider, "_chat_model", None
    )
    return {
        "status": "ok",
        "llm_provider": provider.name,
        "chat_model": chat_model,
        "prompts_version": PROMPTS_VERSION,
    }
