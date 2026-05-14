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
