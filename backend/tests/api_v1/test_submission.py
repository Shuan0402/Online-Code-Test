# backend/tests/api_v1/test_submission.py
import uuid
from unittest.mock import MagicMock
from datetime import datetime, timedelta

from app.main import app
from app.api import deps
from app.services.queue_manager import queue_manager
from app.models.submission import Submission
from app.models.exam import Exam


# --- POST /submissions (建立提交) ---
def test_create_submission_success(client, db_session, candidate_user, override_auth, create_test_problem, monkeypatch):
    """
    測試正常繳交流程
    """
    override_auth(candidate_user)
    problem = create_test_problem(title="Two Sum")
    
    mock_storage = MagicMock()
    mock_storage.upload_source.return_value = "s3://octest-submissions/mock_test.py"
    mock_storage.sign_get_url.return_value = "http://mock-minio-link.com/download"
    app.dependency_overrides[deps.get_storage] = lambda: mock_storage
    monkeypatch.setattr(queue_manager, "push_to_queue", lambda queue_name, data: True)
    
    payload = {
        "problem_id": problem.id,
        "language": "python",
        "source_code": "print('Hello NTUT')",
        "submission_type": "OFFICIAL"
    }
    response = client.post("/api/v1/submissions/", json=payload)
    
    assert response.status_code == 202
    data = response.json()
    assert data["status"] == "Pending"
    assert data["language"] == "python"
    assert "s3://octest-submissions/" in data["code_s3_url"]
    
    if deps.get_storage in app.dependency_overrides:
        del app.dependency_overrides[deps.get_storage]


def test_create_submission_reject_run_only(client, candidate_user, override_auth, create_test_problem):
    """
    測試合約防線：拒絕 RUN_ONLY
    """
    override_auth(candidate_user)
    problem = create_test_problem()
    
    payload = {
        "problem_id": problem.id,
        "language": "python",
        "source_code": "print('Run Only')",
        "submission_type": "RUN_ONLY"
    }
    response = client.post("/api/v1/submissions/", json=payload)
    
    assert response.status_code == 422
    assert "submission_type" in response.text

def test_create_submission_reject_unsupported_language(client, candidate_user, override_auth, create_test_problem):
    """
    測試合約防線：拒絕不支援的程式語言 (非 python/cpp)
    """
    override_auth(candidate_user)
    problem = create_test_problem()
    
    payload = {
        "problem_id": problem.id,
        "language": "java",  # 不在白名單內
        "source_code": "System.out.println('Hello NTUT');",
        "submission_type": "OFFICIAL"
    }
    response = client.post("/api/v1/submissions/", json=payload)
    
    assert response.status_code == 422
    assert "language" in response.text

# --- GET /submissions/{submission_id} (詳細資訊) ---
def test_get_submission_success_by_owner(client, db_session, candidate_user, override_auth, create_test_problem, create_mock_submission):
    """
    本人查詢自己的提交，應該順利拿到資料且包含 details 明細。
    """
    override_auth(candidate_user)
    problem = create_test_problem()
    sub = create_mock_submission(user_id=candidate_user.id, problem_id=problem.id)

    response = client.get(f"/api/v1/submissions/{sub.id}")
    
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "AC"
    assert len(data["details"]) == 1 # 確保一對多關聯明細有被 joinedload 撈出來
    assert data["details"][0]["status"] == "AC"


def test_get_submission_success_by_admin(client, db_session, candidate_user, admin_user, override_auth, create_test_problem, create_mock_submission):
    """
    Admin 查詢別的考生的提交，，應該順利拿到資料且包含 details 明細。
    """
    problem = create_test_problem()
    sub = create_mock_submission(user_id=candidate_user.id, problem_id=problem.id)

    override_auth(admin_user)
    response = client.get(f"/api/v1/submissions/{sub.id}")

    assert response.status_code == 200
    assert response.json()["user_id"] == str(candidate_user.id)


def test_get_submission_forbidden_for_other_candidate(client, db_session, candidate_user, override_auth, create_test_problem, create_test_user, create_mock_submission):
    """
    其他學生嘗試偷看別人的 Code，應該要被 403 Forbidden 擋下。
    """
    problem = create_test_problem()
    sub = create_mock_submission(user_id=candidate_user.id, problem_id=problem.id)
    
    other_student = create_test_user(username="hacker_student")
    override_auth(other_student)
    response = client.get(f"/api/v1/submissions/{sub.id}")
    
    assert response.status_code == 403
    assert "沒有權限" in response.json()["detail"]

def test_get_submission_not_found(client, candidate_user, override_auth):
    """
    查詢一個幽靈 UUID，應該回傳 404。
    """
    override_auth(candidate_user)
    random_uuid = uuid.uuid4()
    
    response = client.get(f"/api/v1/submissions/{random_uuid}")
    assert response.status_code == 404
    
def test_get_submission_includes_presigned_url(client, candidate_user, override_auth, create_test_problem, create_mock_submission):
    """
    測試單筆查詢防線：當紀錄具有有效 S3 路徑時，必須動態派發 presigned_url 供前端下載明文 Code。
    """
    override_auth(candidate_user)
    problem = create_test_problem()
    sub = create_mock_submission(user_id=candidate_user.id, problem_id=problem.id)
    sub.code_s3_url = "s3://octest-submissions/my_code.cpp" 

    mock_storage = MagicMock()
    mock_storage.sign_get_url.return_value = "http://mock-minio-link.com/download-my-code"
    app.dependency_overrides[deps.get_storage] = lambda: mock_storage

    response = client.get(f"/api/v1/submissions/{sub.id}")
    
    assert response.status_code == 200
    data = response.json()
    assert data["presigned_url"] == "http://mock-minio-link.com/download-my-code"

    if deps.get_storage in app.dependency_overrides:
        del app.dependency_overrides[deps.get_storage]

def test_get_latest_submission_includes_presigned_url(client, candidate_user, override_auth, create_test_problem, create_mock_submission):
    """
    測試斷線還原防線：最新提交 API 必須包含 presigned_url，前端才能順利還原編輯器程式碼。
    """
    override_auth(candidate_user)
    problem = create_test_problem()
    sub = create_mock_submission(user_id=candidate_user.id, problem_id=problem.id)
    sub.code_s3_url = "s3://octest-submissions/latest_recovery.py"

    mock_storage = MagicMock()
    mock_storage.sign_get_url.return_value = "http://mock-minio-link.com/download-latest-recovery"
    app.dependency_overrides[deps.get_storage] = lambda: mock_storage

    response = client.get(f"/api/v1/submissions/latest?problem_id={problem.id}")
    
    assert response.status_code == 200
    data = response.json()
    assert data["presigned_url"] == "http://mock-minio-link.com/download-latest-recovery"

    if deps.get_storage in app.dependency_overrides:
        del app.dependency_overrides[deps.get_storage]


def test_get_latest_submission_with_exam_id_filtering(client, db_session, interviewer_user, candidate_user, override_auth, create_test_problem, create_mock_submission):
    """
    測試斷線還原加固：當傳入特定 exam_id 時，應回傳該場考試的最新提交，排除其他考試的干擾。
    """
    override_auth(candidate_user)
    problem = create_test_problem()
    exam_a = Exam(id=uuid.uuid4(), title="模擬考 A", creator_id=interviewer_user.id, candidate_id=candidate_user.id)
    exam_b = Exam(id=uuid.uuid4(), title="模擬考 B", creator_id=interviewer_user.id, candidate_id=candidate_user.id)
    db_session.add(exam_a)
    db_session.add(exam_b)
    db_session.commit()

    sub_a = create_mock_submission(user_id=candidate_user.id, problem_id=problem.id, score=85)
    sub_a.exam_id = exam_a.id
    sub_a.created_at = datetime.now() - timedelta(minutes=10)
    db_session.add(sub_a)
    sub_b = create_mock_submission(user_id=candidate_user.id, problem_id=problem.id, score=98)
    sub_b.exam_id = exam_b.id
    db_session.add(sub_b)
    db_session.commit()

    # 不帶 exam_id ➔ 預設回傳全局最新 (考試 B)
    response_global = client.get(f"/api/v1/submissions/latest?problem_id={problem.id}")
    assert response_global.status_code == 200
    assert response_global.json()["id"] == str(sub_b.id)

    # 帶上 exam_id=A ➔ 回傳較舊、但屬於該場考試的 sub_a
    response_exam_a = client.get(f"/api/v1/submissions/latest?problem_id={problem.id}&exam_id={exam_a.id}")
    assert response_exam_a.status_code == 200
    assert response_exam_a.json()["id"] == str(sub_a.id)
    assert response_exam_a.json()["score"] == 85

    # 傳入一個該生從未在此題提交過的 exam_id ➔ 必須妥善拋出 404
    fake_exam_id = uuid.uuid4()
    response_fake = client.get(f"/api/v1/submissions/latest?problem_id={problem.id}&exam_id={fake_exam_id}")
    assert response_fake.status_code == 404

# --- GET /submissions (列表查詢) ---
def test_get_submissions_list_as_candidate(client, db_session, candidate_user, create_test_user, override_auth, create_test_problem, create_mock_submission):
    """
    學生只能看到自己的，看不到其他學生的提交。
    """
    problem = create_test_problem()
    other_student = create_test_user()
    create_mock_submission(user_id=candidate_user.id, problem_id=problem.id)
    create_mock_submission(user_id=other_student.id, problem_id=problem.id)
    
    override_auth(candidate_user)
    response = client.get("/api/v1/submissions/")
    
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["user_id"] == str(candidate_user.id)


def test_get_submissions_list_as_admin(client, db_session, candidate_user, admin_user, override_auth, create_test_problem, create_mock_submission):
    """
    管理者可以跨全局調閱，並透過 user_id 進行精準查榜。
    """
    problem = create_test_problem()
    create_mock_submission(user_id=candidate_user.id, problem_id=problem.id)

    override_auth(admin_user)
    response = client.get(f"/api/v1/submissions/?user_id={candidate_user.id}")
    
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["user_id"] == str(candidate_user.id)

# --- GET /submissions/latest (最新提交查詢) ---
def test_get_latest_submission_success(client, db_session, candidate_user, override_auth, create_test_problem, create_mock_submission):
    """
    有多筆提交時，應該正確回傳最新產生的那一筆。
    """
    override_auth(candidate_user)
    problem = create_test_problem()

    sub1 = create_mock_submission(user_id=candidate_user.id, problem_id=problem.id, score=40)
    sub1.created_at = datetime.now() - timedelta(minutes=5)
    db_session.add(sub1)
    db_session.commit()
    latest_sub = create_mock_submission(user_id=candidate_user.id, problem_id=problem.id, score=100)
    
    response = client.get(f"/api/v1/submissions/latest?problem_id={problem.id}")
    
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(latest_sub.id)
    assert data["score"] == 100


def test_get_latest_submission_not_found(client, candidate_user, override_auth, create_test_problem):
    """
    如果從來沒交過這題，應該回傳 404。
    """
    override_auth(candidate_user)
    problem = create_test_problem()
    
    response = client.get(f"/api/v1/submissions/latest?problem_id={problem.id}")
    assert response.status_code == 404
    assert "尚未有任何提交紀錄" in response.json()["detail"]