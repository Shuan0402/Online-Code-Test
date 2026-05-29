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
from app.models import user, problem, submission, exam, testcase
from app.models.user import User
from app.models.problem import Problem
from app.models.testcase import TestCase
from app.models.exam import Exam
from app.models.enums import ExamStatus
from app.models.enums import UserRole, DifficultyLevel, JudgeStatus
from app.api import deps
from app.models.submission import Submission, SubmissionDetail
from app.core.security import SecurityManager
from app.services.queue_manager import queue_manager


@pytest.fixture(scope="session")
def setup_db():
    engine = create_engine(SQLALCHEMY_DATABASE_URL)
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def db_session(setup_db):
    engine = setup_db
    connection = engine.connect()
    transaction = connection.begin()
    
    TestingSessionLocal = sessionmaker(bind=connection)
    db = TestingSessionLocal()
    
    try:
        yield db
    finally:
        db.close()
        if transaction.is_active:
            transaction.rollback()
        connection.close()


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
def admin_user(create_test_user):
    """建立並回傳一個 Admin 使用者"""
    return create_test_user(username="admin_boss", role=UserRole.Admin)

@pytest.fixture
def questioner_user(create_test_user):
    """建立並回傳一個出題者使用者"""
    return create_test_user(username="problem_setter", role=UserRole.Questioner)

@pytest.fixture
def interviewer_user(create_test_user):
    """建立並回傳一個面試官使用者"""
    return create_test_user(username="hr_interviewer", role=UserRole.Interviewer)

@pytest.fixture
def candidate_user(create_test_user):
    """建立並回傳一個考生使用者"""
    return create_test_user(username="student_01")

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
            "time_limit_ms": 1000,
            "memory_limit_mb": 256,
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

@pytest.fixture
def create_mock_submission(db_session):
    """
    建立繳交紀錄的工廠 Fixture。
    支援自定義繳交屬性，並且會自動建立一筆對應的 SubmissionDetail。
    """
    def _create(user_id, problem_id, status="AC", score=100):
        tc = db_session.query(TestCase).filter(TestCase.problem_id == problem_id).first()
        if not tc:
            tc = TestCase(
                problem_id=problem_id,
                input_data="mock input",
                expected_output="mock output"
            )
            db_session.add(tc)
            db_session.flush()

        sub = Submission(
            id=uuid.uuid4(),
            user_id=user_id,
            problem_id=problem_id,
            language="python",
            code_s3_url="s3://octest-submissions/test.py",
            status=status,
            score=score,
            submission_type="OFFICIAL"
        )
        db_session.add(sub)
        db_session.flush()
        
        detail = SubmissionDetail(
            submission_id=sub.id,
            testcase_id=tc.id,
            status=JudgeStatus(status),
            execution_time=12,
            score=score
        )
        db_session.add(detail)
        db_session.commit()
        return sub

    return _create

@pytest.fixture
def create_test_user(db_session: Session):
    """
    建立使用者的工廠 Fixture。
    預設建立 Candidate (一般考生)，username 支援傳入或自動加上隨機後綴防衝突。
    """
    def _create_user(username: str = None, role: UserRole = UserRole.Candidate, **kwargs):
        unique_id = uuid.uuid4().hex[:6]
        final_username = username or f"user_{role.value.lower()}_{unique_id}"
        
        defaults = {
            "password_hash": SecurityManager.hash_password("testpassword123"),
            "is_active": True
        }
        defaults.update(kwargs)
        
        db_user = User(
            id=uuid.uuid4(),
            username=final_username,
            role=role,
            **defaults
        )
        db_session.add(db_user)
        db_session.commit()
        db_session.refresh(db_user)
        return db_user

    return _create_user

@pytest.fixture
def create_test_exam(db_session, interviewer_user, candidate_user):
    """
    Exam 測試工廠 Fixture。
    """
    def _create(
        title: str = "預設測試考試場次",
        status: ExamStatus = ExamStatus.Draft,
        duration_minutes: int = 120,
        **kwargs
    ):
        kwargs.setdefault("id", uuid.uuid4())
        kwargs.setdefault("title", title)
        kwargs.setdefault("status", status)
        kwargs.setdefault("duration_minutes", duration_minutes)
        kwargs.setdefault("creator_id", interviewer_user.id)
        kwargs.setdefault("candidate_id", candidate_user.id)
        
        exam = Exam(**kwargs)
        
        db_session.add(exam)
        db_session.commit()
        return exam
        
    return _create

@pytest.fixture(scope="function")
def test_queue_client():
    """
    給單元測試撈取 Redis 隊列的專用客戶端
    直接借用 queue_manager 當前在記憶體裡咬住的那個實體 client
    """
    queue_manager.client.delete(queue_manager.QUEUE_PENDING)
    queue_manager.client.delete(queue_manager.queue_name)
    
    yield queue_manager.client
    
    queue_manager.client.delete(queue_manager.QUEUE_PENDING)
    queue_manager.client.delete(queue_manager.queue_name)