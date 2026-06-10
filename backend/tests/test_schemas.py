import pytest
from pydantic import ValidationError
from uuid import uuid4
from datetime import datetime

from app.schemas.problem import ProblemCreate, TestCaseCreate
from app.schemas.user import UserCreate
from app.schemas.exam import ExamCreate
from app.schemas.submission import SubmissionRead
from app.schemas.admin import (
    SystemHardwareMetrics,
    DashboardSummaryResponse,
    AnomalySubmissionItem,
    AnomalyLogResponse,
)
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


def test_schemas_init_exports_expected_items():
    """
    測試 app.schemas 包的 __init__.py 是否正確匯出模型。
    """
    import app.schemas as schemas

    expected_exports = [
        "UserCreate",
        "UserRead",
        "Token",
        "TokenPayload",
        "ProblemCreate",
        "TestCaseRead",
        "ExamCreate",
        "ExamRead",
        "SubmissionRead",
    ]

    for attr in expected_exports:
        assert hasattr(schemas, attr), f"app.schemas 缺少 {attr}"

    from app.schemas import UserCreate, Token, ProblemCreate

    assert UserCreate.__name__ == "UserCreate"
    assert Token.__name__ == "Token"
    assert ProblemCreate.__name__ == "ProblemCreate"


def test_admin_system_hardware_metrics_and_dashboard_response():
    """
    測試管理員儀表板回傳資料與系統硬體指標模型。
    """
    hardware = SystemHardwareMetrics(cpu_usage_percent=12.5, memory_usage_percent=33.3)
    dashboard = DashboardSummaryResponse(
        active_candidates_count=120,
        system_hardware=hardware,
        pending_tasks_count=7,
    )

    assert dashboard.active_candidates_count == 120
    assert dashboard.system_hardware.cpu_usage_percent == 12.5
    assert dashboard.system_hardware.memory_usage_percent == 33.3
    assert dashboard.pending_tasks_count == 7


def test_admin_anomaly_submission_item_from_attributes_and_optional_fields():
    """
    測試 AnomalySubmissionItem 支援 from_attributes 與可選欄位。
    """
    class FakeSubmission:
        def __init__(self):
            self.exam_name = "Final Exam"
            self.exam_id = "exam-uuid"
            self.problem_name = "Sum Problem"
            self.problem_id = 42
            self.submitted_at = datetime(2026, 6, 10, 12, 0, 0)
            self.username = "candidate_01"
            self.candidate_name = "John Doe"
            self.verdict = JudgeStatus.AC
            self.client_ip = "192.0.2.1"
            self.error_detail = None
            self.failure_reason = "Segmentation fault"

    fake = FakeSubmission()
    item = AnomalySubmissionItem.model_validate(fake)

    assert item.exam_name == "Final Exam"
    assert item.problem_id == 42
    assert item.username == "candidate_01"
    assert item.client_ip == "192.0.2.1"
    assert item.failure_reason == "Segmentation fault"
    assert item.error_detail is None


def test_admin_anomaly_log_response_pagination():
    """
    測試異常日誌回傳的列表結構與分頁欄位。
    """
    item = AnomalySubmissionItem(
        exam_name="Sample Exam",
        exam_id="sample-exam",
        problem_name="Example Problem",
        problem_id=1,
        submitted_at=datetime.now(),
        username="user123",
        candidate_name="Candidate",
        verdict=JudgeStatus.WA,
    )
    resp = AnomalyLogResponse(items=[item], total=1, page=1, size=10)

    assert resp.total == 1
    assert resp.page == 1
    assert resp.size == 10
    assert len(resp.items) == 1
    assert resp.items[0].verdict == JudgeStatus.WA
