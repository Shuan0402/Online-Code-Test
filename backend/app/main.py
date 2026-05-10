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
import psycopg
from fastapi import FastAPI

from app.db.session import engine
from app.db.base import Base
from .models import user, problem, submission, exam, exam_problem, testcase

from app.api.api_v1.api import api_router

app = FastAPI()

Base.metadata.create_all(bind=engine)

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
