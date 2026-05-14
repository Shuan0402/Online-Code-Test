import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
import uuid
from contextlib import contextmanager

from app.main import app
from app.db.base import Base
from app.db.session import engine as prod_engine, SQLALCHEMY_DATABASE_URL
from app.api.deps import get_db
from app.models import user, problem, submission, exam, exam_problem, testcase
from app.models.user import User
from app.models.problem import Problem
from app.models.testcase import TestCase
from app.models.enums import UserRole, DifficultyLevel
from app.api import deps


@pytest.fixture(scope="function")
def db_session():
    engine = create_engine(SQLALCHEMY_DATABASE_URL)
    TestingSessionLocal = sessionmaker(bind=engine)
    Base.metadata.create_all(bind=engine)
    
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def client(db_session):
    def _get_test_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _get_test_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

@pytest.fixture
def admin_user(db_session: Session):
    """建立並回傳一個 Admin 使用者"""
    user = User(
        id=uuid.uuid4(),
        username="admin_boss",
        password_hash="hashed_password",
        role=UserRole.Admin,
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user

@pytest.fixture
def questioner_user(db_session: Session):
    """建立並回傳一個出題者使用者"""
    user = User(
        id=uuid.uuid4(),
        username="problem_setter",
        password_hash="hashed_password",
        role=UserRole.Questioner,
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user

@pytest.fixture
def interviewer_user(db_session: Session):
    """建立並回傳一個面試官使用者"""
    user = User(
        id=uuid.uuid4(),
        username="hr_interviewer",
        password_hash="hashed_password",
        role=UserRole.Interviewer,
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user

@pytest.fixture
def candidate_user(db_session: Session):
    """建立並回傳一個考生使用者"""
    user = User(
        id=uuid.uuid4(),
        username="student_01",
        password_hash="hashed_password",
        role=UserRole.Candidate,
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user

@pytest.fixture
def override_auth():
    """
    提供一個動態覆蓋權限的工具。
    使用 yield 確保測試結束後自動 clear()。
    """
    overrides = app.dependency_overrides
    
    def _apply_login(user):
        overrides[deps.get_current_user] = lambda: user

    yield _apply_login
    
    overrides.clear()

@pytest.fixture
def create_test_problem(db_session, admin_user):
    """
    建立題目的工廠 Fixture。
    支援自定義題目屬性以及批量建立測資。
    """
    def _create_problem(
        user=None, 
        title="Default Title", 
        test_cases_data=None, 
        **kwargs
    ):
        creator = user or admin_user

        defaults = {
            "description": "Default test description",
            "difficulty": DifficultyLevel.Medium,
            "time_limit": 1000,
            "memory_limit": 256,
            "creator_id": creator.id
        }
        defaults.update(kwargs)
        
        db_problem = Problem(title=title, **defaults)
        db_session.add(db_problem)
        db_session.flush()

        created_tcs = []
        if test_cases_data:
            for tc_data in test_cases_data:
                tc = TestCase(**tc_data, problem_id=db_problem.id)
                db_session.add(tc)
                created_tcs.append(tc)
        
        db_session.commit()
        db_session.refresh(db_problem)
        
        return db_problem

    return _create_problem