import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.api import deps

from app.models.problem import Problem
from app.models.enums import DifficultyLevel, UserRole
from app.models.user import User
from app.models.testcase import TestCase

# --- GET /problems (列表展示) ---
def test_read_problems_empty(client: TestClient):
    """
    測試當資料庫沒有題目時，應回傳空列表
    """
    response = client.get("/api/v1/problems/")
    assert response.status_code == 200
    assert response.json() == []

def test_read_problems_schema_filtering(client: TestClient, db_session: Session):
    """
    測試 Schema 濾網是否正常：不應包含 description
    """
    test_user = User(
        id=uuid.uuid4(),
        username="test_creator",
        password_hash="fake_hash",
        role=UserRole.Admin,
        is_active=True
    )
    db_session.add(test_user)
    db_session.flush()

    test_problem = Problem(
        title="Test Problem",
        description="This is a secret description", # 這不應該出現在回傳結果中
        difficulty=DifficultyLevel.Easy,
        time_limit=1000,
        memory_limit=256,
        creator_id=test_user.id
    )
    db_session.add(test_problem)
    db_session.commit()

    response = client.get("/api/v1/problems/")
    data = response.json()

    assert response.status_code == 200
    assert len(data) == 1
    assert "description" not in data[0]

def test_read_problems_pagination(client: TestClient, db_session: Session):
    """
    測試分頁功能 (skip, limit) 是否生效
    """
    for i in range(5):
        u = User(
            id=uuid.uuid4(),
            username=f"creator_{i}",
            password_hash="fake_hash",
            role=UserRole.Admin,
            is_active=True
        )
        db_session.add(u)
        db_session.flush()

        p = Problem(
            title=f"Problem {i}",
            description="...",
            difficulty=DifficultyLevel.Medium,
            creator_id=u.id
        )
        db_session.add(p)
    db_session.commit()

    response = client.get("/api/v1/problems/?limit=2")
    assert len(response.json()) == 2

    response = client.get("/api/v1/problems/?skip=3")
    data = response.json()
    assert len(data) == 2
    assert data[0]["title"] == "Problem 3"


# --- GET /problems/{problem_id} (詳細資訊) ---
def mock_get_current_user(user: User):
    """
    用來覆蓋 FastAPI 的 deps.get_current_user
    """
    return lambda: user

def test_read_problem_detail_as_admin(client: TestClient, db_session: Session):
    """
    測試 Admin 讀取細節：應看到所有測資（包含隱藏測資）
    """
    admin_user = User(
        id=uuid.uuid4(), 
        username="admin_test", 
        password_hash="hashed_pwd",
        role=UserRole.Admin,
        is_active=True
    )
    db_session.add(admin_user)
    db_session.flush()

    p = Problem(title="Admin Problem", description="...", difficulty=DifficultyLevel.Hard, creator_id=admin_user.id)
    db_session.add(p)
    db_session.flush()
    db_session.add(TestCase(input_data="in", expected_output="out", is_sample=False, problem_id=p.id))
    db_session.commit()

    app.dependency_overrides[deps.get_current_user] = mock_get_current_user(admin_user)
    response = client.get(f"/api/v1/problems/{p.id}")
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert len(response.json()["test_cases"]) == 1

def test_read_problem_detail_as_candidate_security(client: TestClient, db_session: Session):
    """
    測試 Candidate 讀取細節：只能看到範例測資，隱藏測資應被過濾掉
    """
    creator = User(id=uuid.uuid4(), username="q_user", password_hash="h", role=UserRole.Questioner)
    candidate = User(id=uuid.uuid4(), username="student", password_hash="h", role=UserRole.Candidate)
    db_session.add_all([creator, candidate])
    db_session.flush()

    p = Problem(title="Secret Test", description="...", difficulty=DifficultyLevel.Easy, creator_id=creator.id)
    db_session.add(p)
    db_session.flush()
    db_session.add(TestCase(input_data="sample", expected_output="ok", is_sample=True, problem_id=p.id))
    db_session.add(TestCase(input_data="hidden", expected_output="no", is_sample=False, problem_id=p.id))
    db_session.commit()

    
    app.dependency_overrides[deps.get_current_user] = mock_get_current_user(candidate)
    response = client.get(f"/api/v1/problems/{p.id}")
    app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert len(data["test_cases"]) == 1
    assert data["test_cases"][0]["is_sample"] is True

def test_read_problem_not_found(client: TestClient, db_session: Session):
    """
    測試讀取不存在的題目應回傳 404
    """
    any_user = User(id=uuid.uuid4(), username="any", password_hash="h", role=UserRole.Candidate)
    db_session.add(any_user)
    db_session.commit()

    app.dependency_overrides[deps.get_current_user] = mock_get_current_user(any_user)    
    response = client.get("/api/v1/problems/99999")
    app.dependency_overrides.clear()

    assert response.status_code == 404