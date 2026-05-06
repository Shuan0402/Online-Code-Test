import pytest
from pydantic import ValidationError
from app.schemas.problem import ProblemCreate, DifficultyEnum
from app.schemas.user import UserCreate
from app.schemas.submission import SubmissionRead, JudgeStatus
from datetime import datetime


def test_problem_schema_valid():
    """
    測試正確的題目資料。
    """
    payload = {
        "title": "A + B",
        "description": "Calculate sum",
        "difficulty": "Easy",
        "time_limit": 1000,
        "memory_limit": 256
    }

    prob = ProblemCreate(**payload)

    assert prob.title == "A + B"
    assert prob.difficulty == DifficultyEnum.EASY

def test_problem_schema_invalid_difficulty():
    """
    測試錯誤的難度字串。
    """
    payload = {
        "title": "A + B",
        "description": "Desc",
        "difficulty": "Impossible" # 不存在的 Enum
    }

    with pytest.raises(ValidationError):
        ProblemCreate(**payload)

def test_user_create_password_length():
    """
    測試密碼長度限制。
    """
    short_pw_payload = {
        "username": "testuser",
        "password": "123", # 太短
        "role": "Candidate"
    }

    with pytest.raises(ValidationError):
        UserCreate(**short_pw_payload)

def test_user_username_too_short():
    """
    測試帳號長度限制。
    """
    short_user_payload = {
        "username": "ab", # 太短
        "password": "valid_password",
        "role": "Candidate"
    }

    with pytest.raises(ValidationError):
        UserCreate(**short_user_payload)

def test_submission_read_from_orm():
    """
    測試 SubmissionRead 是否能正確處理 Optional 欄位與 Enum
    """
    mock_data = {
        "id": "some-uuid-string",
        "user_id": "user-uuid",
        "problem_id": 1,
        "language": "python",
        "code_s3_url": "s3://path",
        "status": "AC",
        "execution_time": None, # 測試 Nullable
        "memory_usage": 50,
        "created_at": datetime.now()
    }
    
    sub = SubmissionRead(**mock_data)
    assert sub.status == JudgeStatus.AC
    assert sub.execution_time is None