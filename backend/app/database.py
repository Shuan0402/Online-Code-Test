import os
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from dotenv import load_dotenv

load_dotenv()

# DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./test.db")
PG_USER = os.getenv("POSTGRES_USER")
PG_PASSWORD = os.getenv("POSTGRES_PASSWORD")
PG_HOST = os.getenv("POSTGRES_HOST", "pg")  # 在 Docker 內是 'pg'
PG_DB = os.getenv("POSTGRES_DB")

if all([PG_USER, PG_PASSWORD, PG_DB]):
    # 如果 Jane 的變數都有，就用 PostgreSQL
    DATABASE_URL = f"postgresql://{PG_USER}:{PG_PASSWORD}@{PG_HOST}/{PG_DB}"
else:
    # 否則回退到你原本的 SQLite (開發測試用)
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./test.db")

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(
        DATABASE_URL,
        pool_size=10,
        max_overflow=20,
        pool_recycle=3600
    )
print(f"DEBUG: Connecting to database at: {DATABASE_URL}")

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass

def get_db():
    """
    提供資料庫 Session，並在請求結束後自動關閉。
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()