import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# 從環境變數讀取資料庫連線資訊，並提供預設值
POSTGRES_USER = os.getenv("POSTGRES_USER", "octest")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "changeme")
POSTGRES_SERVER = os.getenv("POSTGRES_HOST", "pg")
POSTGRES_DB = os.getenv("POSTGRES_DB", "octest")

SQLALCHEMY_DATABASE_URL = (
    f"postgresql+psycopg://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_SERVER}/{POSTGRES_DB}"
)

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)