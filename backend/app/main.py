# TODO(jane): PLACEHOLDER for Docker / Compose learning. Replaced by B's real backend.
# /health and /db-check exist to verify compose env injection + service-name DNS.

import os

import psycopg
from fastapi import FastAPI

app = FastAPI()


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
