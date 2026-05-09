import os
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app.models import User, Problem, TestCase, Submission, Exam, ExamProblem

DB_USER = os.getenv("POSTGRES_USER", "octest")
DB_PASS = os.getenv("POSTGRES_PASSWORD", "changeme")
DB_HOST = os.getenv("POSTGRES_HOST", "pg")
DB_NAME = os.getenv("POSTGRES_DB", "octest")

SQLALCHEMY_DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASS}@{DB_HOST}/{DB_NAME}"

@pytest.fixture(scope="function")
def db_session():
    """
    建立測試專用的資料庫連線
    """
    engine = create_engine(SQLALCHEMY_DATABASE_URL)
    
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    Base.metadata.create_all(bind=engine)

    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)