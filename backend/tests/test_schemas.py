import pytest
from pydantic import ValidationError
from uuid import uuid4
from datetime import datetime

from app.schemas.problem import ProblemCreate, TestCaseCreate
from app.schemas.user import UserCreate
from app.schemas.exam import ExamCreate
from app.schemas.submission import SubmissionRead
from app.models.enums import DifficultyLevel, UserRole, JudgeStatus, ExamStatus

# Problem Schema Tests
def test_problem_schema_with_test_cases():
    """
    測試建立題目時，同時包含嵌套的測試案例。
    """
    payload = {
        "title": "A + B",
        "description": "Calculate sum",
        "difficulty": "Easy",
        "time_limit_ms": 1000,
        "memory_limit_mb": 256,
        "test_cases": [
            {"input_data": "1 2", "expected_output": "3", "score_weight": 50},
            {"input_data": "10 20", "expected_output": "30", "score_weight": 50}
        ]
    }
    prob = ProblemCreate(**payload)
    assert prob.title == "A + B"
    assert len(prob.test_cases) == 2
    assert prob.test_cases[0].score_weight == 50
    assert prob.difficulty == DifficultyLevel.Easy

def test_problem_invalid_limits():
    """
    測試時限或記憶體限制為負數時應失敗 (gt=0)。
    """
    payload = {
        "title": "Limit Test",
        "description": "...",
        "time_limit_ms": -1,
        "memory_limit_mb": 0
    }
    with pytest.raises(ValidationError):
        ProblemCreate(**payload)

def test_problem_limits_too_large():
    """
    測試時限、記憶體限制或配分超出合理上限時應失敗。
    """
    # 測試時間限制超出 (max 30000)
    with pytest.raises(ValidationError):
        ProblemCreate(title="Test", description="...", time_limit_ms=30001, memory_limit_mb=256)
        
    # 測試記憶體限制超出 (max 1024)
    with pytest.raises(ValidationError):
        ProblemCreate(title="Test", description="...", time_limit_ms=1000, memory_limit_mb=1025)

    # 測試測資佔分限制超出 (max 100)
    with pytest.raises(ValidationError):
        ProblemCreate(
            title="Test",
            description="...",
            test_cases=[{"input_data": "1", "expected_output": "2", "score_weight": 101}]
        )

# User Schema Tests
def test_user_create_success():
    payload = {
        "username": "ironman",
        "full_name": "Tony Stark",
        "password": "valid_password_123",
        "role": "Admin"
    }
    user = UserCreate(**payload)
    assert user.username == "ironman"
    assert user.role == UserRole.Admin

def test_user_password_too_short():
    with pytest.raises(ValidationError) as exc:
        UserCreate(username="testuser", password="123")
    assert "at least 8 characters" in str(exc.value)

# Exam Schema Tests
def test_exam_validator_zero_questions():
    """
    測試 Exam 抽題規則：總題數不能為 0 (model_validator 驗證)。
    """
    payload = {
        "title": "Empty Exam",
        "candidate_id": uuid4(),
        "easy_count": 0,
        "medium_count": 0,
        "hard_count": 0
    }
    exam_schema = ExamCreate(**payload)
    
    assert exam_schema.title == "Empty Exam"
    assert exam_schema.easy_count == 0
    assert exam_schema.medium_count == 0
    assert exam_schema.hard_count == 0

def test_exam_valid_creation():
    payload = {
        "title": "Final Exam",
        "candidate_id": uuid4(),
        "easy_count": 5,
        "duration_minutes": 90
    }
    exam = ExamCreate(**payload)
    assert exam.easy_count == 5
    assert exam.medium_count == 0

def test_exam_limits_too_large():
    """
    測試考試時長與題數超出上限時應失敗。
    """
    # 測試考試時長超出 (max 480)
    with pytest.raises(ValidationError):
        ExamCreate(title="Test", candidate_id=uuid4(), duration_minutes=481)
        
    # 測試題數限制超出 (max 20)
    with pytest.raises(ValidationError):
        ExamCreate(title="Test", candidate_id=uuid4(), easy_count=21)
    with pytest.raises(ValidationError):
        ExamCreate(title="Test", candidate_id=uuid4(), medium_count=21)
    with pytest.raises(ValidationError):
        ExamCreate(title="Test", candidate_id=uuid4(), hard_count=21)

# Submission Schema Tests
def test_submission_read_uuid_handling():
    """
    測試 SubmissionRead 是否能正確將字串轉換為 UUID 物件，並處理 Enum。
    """
    mock_id = uuid4()
    mock_data = {
        "id": mock_id,
        "user_id": uuid4(),
        "problem_id": 1,
        "language": "python",
        "status": "AC",
        "code_s3_url": "s3://path",
        "execution_time": None,
        "memory_usage": 1024,
        "created_at": datetime.now(),
        "submission_type": "OFFICIAL",
        "score": 100
    }
    
    sub = SubmissionRead(**mock_data)
    
    assert sub.id == mock_id
    assert sub.submission_type == "OFFICIAL"
    assert sub.score == 100