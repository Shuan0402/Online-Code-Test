# backend/tests/api_v1/test_submission.py
import uuid
import pytest
from unittest.mock import MagicMock

from app.main import app
from app.api import deps
from app.services.queue_manager import queue_manager
from app.models.submission import Submission


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
    