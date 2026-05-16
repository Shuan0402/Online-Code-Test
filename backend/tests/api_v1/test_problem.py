import uuid
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

def test_read_problems_schema_filtering(client: TestClient, questioner_user: User, db_session: Session):
    """
    測試 Schema 濾網是否正常：不應包含 description
    """
    test_problem = Problem(
        title="Test Problem",
        description="This is a secret description", # 這不應該出現在回傳結果中
        difficulty=DifficultyLevel.Easy,
        time_limit=1000,
        memory_limit=256,
        creator_id=questioner_user.id
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

def test_read_problem_detail_as_admin(client: TestClient, admin_user: User, db_session: Session):
    """
    測試 Admin 讀取細節：應看到所有測資（包含隱藏測資）
    """
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

def test_read_problem_detail_as_candidate_security(client: TestClient, questioner_user: User, candidate_user: User, db_session: Session):
    """
    測試 Candidate 讀取細節：只能看到範例測資，隱藏測資應被過濾掉
    """
    db_session.add_all([questioner_user, candidate_user])
    db_session.flush()

    p = Problem(title="Secret Test", description="...", difficulty=DifficultyLevel.Easy, creator_id=questioner_user.id)
    db_session.add(p)
    db_session.flush()
    db_session.add(TestCase(input_data="sample", expected_output="ok", is_sample=True, problem_id=p.id))
    db_session.add(TestCase(input_data="hidden", expected_output="no", is_sample=False, problem_id=p.id))
    db_session.commit()

    
    app.dependency_overrides[deps.get_current_user] = mock_get_current_user(candidate_user)
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

# --- POST /problems (建立題目) ---
def test_create_problem_success_as_admin(client: TestClient, admin_user: User, override_auth):
    payload = {
        "title": "New Problem",
        "description": "Desc",
        "difficulty": "Medium",
        "time_limit": 1000,
        "memory_limit": 256,
        "test_cases": [
            {"input_data": "1", "expected_output": "2", "is_sample": True}
        ]
    }

    override_auth(admin_user)
    response = client.post("/api/v1/problems/", json=payload)

    assert response.status_code == 201
    assert response.json()["title"] == "New Problem"

def test_create_problem_success_as_questioner(client: TestClient, questioner_user: User, override_auth):
    """
    測試 Questioner (出題者) 成功建立題目
    """
    payload = {
        "title": "Questioner's Challenge",
        "description": "Prove your logic",
        "difficulty": "Medium",
        "time_limit": 2000,
        "memory_limit": 512,
        "test_cases": [
            {"input_data": "start", "expected_output": "end", "is_sample": True}
        ]
    }

    override_auth(questioner_user)
    response = client.post("/api/v1/problems/", json=payload)

    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Questioner's Challenge"
    assert data["creator_id"] == str(questioner_user.id)

def test_create_problem_forbidden_as_interviewer(client: TestClient, interviewer_user: User, override_auth):
    """
    測試 Interviewer (面試官) 雖然是 staff，但不具備出題權限
    """
    payload = {"title": "Interviewer Hack", "description": "...", "test_cases": []}
    
    override_auth(interviewer_user)
    response = client.post("/api/v1/problems/", json=payload)

    assert response.status_code == 403

def test_create_problem_forbidden_as_candidate(client: TestClient, candidate_user: User, override_auth):
    """
    測試 Candidate (考生) 不能出題
    """
    payload = {"title": "Student's Trap", "description": "...", "test_cases": []}
    
    override_auth(candidate_user)
    response = client.post("/api/v1/problems/", json=payload)

    assert response.status_code == 403

# --- PATCH /problems/{problem_id} (增量更新) ---
def test_update_problem_basic_fields(client: TestClient, admin_user: User, db_session: Session, override_auth):
    """
    測試僅修改題目的基本資訊（不更動測資）
    """
    p = Problem(title="Old Title", description="Old Desc", difficulty=DifficultyLevel.Easy, creator_id=admin_user.id)
    db_session.add(p)
    db_session.commit()

    override_auth(admin_user)
    payload = {"title": "New Title", "difficulty": "Hard"}
    response = client.patch(f"/api/v1/problems/{p.id}", json=payload)
    
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "New Title"
    assert data["difficulty"] == "Hard"
    assert data["description"] == "Old Desc"

def test_update_problem_incremental_test_cases(client: TestClient, admin_user: User, db_session: Session, override_auth):
    """
    增量更新測資邏輯，修改 ID 1、刪除 ID 2 (不傳送)、新增一筆測資
    """
    p = Problem(title="TC Test", description="...", difficulty=DifficultyLevel.Medium, creator_id=admin_user.id)
    db_session.add(p)
    db_session.flush()
    tc1 = TestCase(input_data="in1", expected_output="out1", problem_id=p.id)
    tc2 = TestCase(input_data="in2", expected_output="out2", problem_id=p.id)
    db_session.add_all([tc1, tc2])
    db_session.commit()
    db_session.refresh(tc1)
    db_session.refresh(tc2)

    override_auth(admin_user)
    payload = {
        "test_cases": [
            {
                "id": tc1.id, 
                "input_data": "updated_in1", 
                "expected_output": "out1"
            },
            {
                "input_data": "new_in3", 
                "expected_output": "out3", 
                "is_sample": True
            }
        ]
    }
    
    response = client.patch(f"/api/v1/problems/{p.id}", json=payload)
    assert response.status_code == 200
    
    data = response.json()
    tcs = data["test_cases"]
    assert len(tcs) == 2
    
    updated_tc1 = next(tc for tc in tcs if tc["id"] == tc1.id)
    assert updated_tc1["input_data"] == "updated_in1"
    new_tc = next(tc for tc in tcs if tc["input_data"] == "new_in3")
    assert new_tc["expected_output"] == "out3"
    assert new_tc["is_sample"] is True
    assert not any(tc["id"] == tc2.id for tc in tcs)

def test_update_problem_cross_user_permission(client: TestClient, admin_user: User, questioner_user: User, db_session: Session, override_auth, create_test_problem):
    """
    測試出題者 A 修改出題者 B 的題目
    """
    p = create_test_problem(title="My Title", creator_id=admin_user.id)

    override_auth(questioner_user)
    payload = {"title": "Updated by Questioner"}
    response = client.patch(f"/api/v1/problems/{p.id}", json=payload)
    
    assert response.status_code == 200
    assert response.json()["title"] == "Updated by Questioner"

def test_update_problem_forbidden_as_candidate(client: TestClient, candidate_user: User, admin_user: User, db_session: Session, override_auth, create_test_problem):
    """
    測試考生嘗試修改題目
    """
    p = create_test_problem(title="My Title", creator_id=admin_user.id)

    override_auth(candidate_user)
    response = client.patch(f"/api/v1/problems/{p.id}", json={"title": "Hacked"})
    
    assert response.status_code == 403

def test_update_problem_not_found(client: TestClient, admin_user: User, override_auth):
    """
    測試修改不存在的題目編號
    """
    override_auth(admin_user)
    response = client.patch("/api/v1/problems/99999", json={"title": "Ghost"})
    assert response.status_code == 404

# --- DELETE /problems/{problem_id} (Soft Delete) ---
def test_delete_problem_soft_success(client: TestClient, db_session: Session, admin_user, override_auth, create_test_problem):
    """
    測試成功執行軟刪除。
    """
    p = create_test_problem(title="My Title", creator_id=admin_user.id)
    db_session.refresh(p)

    override_auth(admin_user)
    response = client.delete(f"/api/v1/problems/{p.id}")
    
    assert response.status_code == 204
    assert response.text == ""
    db_session.expire_all()
    db_p = db_session.query(Problem).filter(Problem.id == p.id).first()
    assert db_p is not None
    assert db_p.is_deleted is True

def test_delete_problem_already_deleted_returns_404(client: TestClient, db_session: Session, admin_user, override_auth, create_test_problem):
    """
    測試刪除一個「已經被軟刪除」的題目。
    """
    p = create_test_problem(title="My Title", creator_id=admin_user.id, is_deleted=True)

    override_auth(admin_user)
    response = client.delete(f"/api/v1/problems/{p.id}")
    
    assert response.status_code == 404
    assert response.json()["detail"] == "題目不存在"

def test_delete_problem_cross_user_success(client: TestClient, db_session: Session, questioner_user, admin_user, override_auth, create_test_problem):
    """
    驗證出題者 A 可以刪除出題者 B 的題目。
    """
    p = create_test_problem(title="My Title", creator_id=admin_user.id)

    override_auth(questioner_user)
    response = client.delete(f"/api/v1/problems/{p.id}")
    
    assert response.status_code == 204
    db_session.expire_all()
    db_p = db_session.query(Problem).filter(Problem.id == p.id).first()
    assert db_p.is_deleted is True

def test_delete_problem_forbidden_for_candidate(client: TestClient, db_session: Session, candidate_user, admin_user, override_auth, create_test_problem):
    """
    驗證一般考生 (Candidate) 無權刪除題目。
    """
    p = create_test_problem(title="My Title", creator_id=admin_user.id)

    override_auth(candidate_user)
    response = client.delete(f"/api/v1/problems/{p.id}")
    
    assert response.status_code == 403
    db_session.refresh(p)
    assert p.is_deleted is False

def test_delete_problem_not_found(client: TestClient, admin_user, override_auth):
    """
    測試刪除不存在的 ID。
    """
    override_auth(admin_user)
    response = client.delete("/api/v1/problems/99999")
    assert response.status_code == 404