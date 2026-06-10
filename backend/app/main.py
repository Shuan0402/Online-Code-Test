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
import logging
from contextlib import asynccontextmanager

import psycopg
from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator
from fastapi.middleware.cors import CORSMiddleware

from app.core.logging import setup_logging
from app.core.config import settings
from app.core.redis_client import init_redis_health_check
from app.db.base import Base
from app.db.session import engine
from app.models.user import User

setup_logging(log_level=getattr(settings, "LOG_LEVEL", "INFO"))
logger = logging.getLogger("app")

from app.api.api_v1.api import api_router
from app.api.deps import get_storage

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)

    logger.info("Online Code Test Backend 正在啟動，開始執行生命週期初始化...")
    init_redis_health_check()

    # Dev convenience: create octest-submissions bucket if missing.
    # Soft-fail if MinIO unreachable so tests / cold boots don't crash.
    try:
        logger.info("正在檢查並確保 MinIO 物件儲存桶 (Bucket) 已建立...")
        get_storage().ensure_bucket()
        logger.info("MinIO 儲存桶檢查完成，狀態正常。")
    except KeyError:
        logger.warning("警告：未偵測到 MINIO_USER 或 MINIO_PASSWORD 環境變數，跳過儲存桶初始化。")
    except Exception as exc:
        logger.exception("嚴重錯誤：MinIO 儲存空間連線異常，可能影響後續判題與檔案儲存功能！")
    yield

    logger.info("Online Code Test Backend 正在關閉，釋放所有系統資源...")

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # 物理咬合前端 React 的本地埠
    allow_credentials=True,
    allow_methods=["*"],                      # 允許 GET, POST, OPTIONS 等所有方法
    allow_headers=["*"],                      # 允許所有自訂或標準 HTTP Headers
)

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
    logger.info("收到手動資料庫健康檢查請求，正在嘗試建立實體連線測試...")
    try:
        db_url = getattr(settings, "DATABASE_URL", None) or os.environ.get("DATABASE_URL")
        
        if not db_url:
            pg_host = os.environ.get("POSTGRES_HOST", "pg")
            pg_user = os.environ.get("POSTGRES_USER", "postgres")
            pg_pass = os.environ.get("POSTGRES_PASSWORD", "")
            pg_db = os.environ.get("POSTGRES_DB", "postgres")
            db_url = f"postgresql://{pg_user}:{pg_pass}@{pg_host}:5432/{pg_db}"

        logger.info("正在連線至資料庫目標...")
        with psycopg.connect(db_url) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT version()")
                ver = cur.fetchone()[0]
        logger.info(f"資料庫連線測試成功！PostgreSQL 版本: {ver}")
        return {"status": "ok", "postgres_version": ver}
    except Exception as exc:
        logger.exception("錯誤：無法連接到 PostgreSQL 資料庫，請檢查 Docker 網路或環境變數！")
        return {"status": "error", "error": str(exc)}

try:
    print("正在初始化 Prometheus 儀表板並註冊 /metrics 端點...")
    
    instrumentator = Instrumentator(
        should_group_status_codes=False,
        should_instrument_requests_inprogress=True
    )
    
    instrumentator.instrument(app).expose(app, endpoint="/metrics")
    
    print("Prometheus /metrics 端點已成功掛載至全域路由！")
except Exception as debug_err:
    print(f"儀表板註冊失敗！原因: {debug_err}")