# ============================================================
# ⚠️  PLACEHOLDER — REPLACE WITH REAL BACKEND CODE
# ============================================================
# This file exists only so the docker stack starts cleanly.
# /health is the only required contract — anything else is for testing.
# Owner: @Shuan0402 — feel free to overwrite this entire file.
#
# Compose 對這支 main.py 的合約：
#   - listen 0.0.0.0:8000
#   - GET /health 回 200（compose healthcheck 在打）
#   - 從 env 讀 DATABASE_URL
#
# /db-check 只是 placeholder 自驗 stack 用，**真 backend 不該保留**。
# ============================================================

import os
from contextlib import asynccontextmanager

import psycopg
from fastapi import FastAPI

from app.core.logging import setup_logging
from app.core.config import settings

setup_logging(log_level=getattr(settings, "LOG_LEVEL", "INFO"))

from app.db.session import engine
from app.db.base import Base
from app.models import user, problem, submission, exam, testcase
from app.api.api_v1.api import api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Dev convenience: create octest-submissions bucket if missing.
    # Soft-fail if MinIO unreachable so tests / cold boots don't crash.
    from app.api.deps import get_storage
    try:
        get_storage().ensure_bucket()
    except KeyError:
        # MINIO_USER / MINIO_PASSWORD env not set (e.g. some test envs).
        pass
    yield

app = FastAPI(lifespan=lifespan)

app.include_router(api_router, prefix="/api/v1")

@app.get("/")
def root():
    return {"hello": "online-code-test backend"}


@app.get("/health")
def health():
    # Liveness probe: this process is alive. Does not check DB.
    return {"status": "ok"}


@app.get("/db-check")
def db_check():
    # Readiness probe for the DB chain: env injection + service-name DNS + pg accept.
    try:
        with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT version()")
                ver = cur.fetchone()[0]
        return {"status": "ok", "postgres_version": ver}
    except Exception as exc:
        return {"status": "error", "error": str(exc)}
