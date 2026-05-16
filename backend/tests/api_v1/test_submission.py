# backend/tests/api_v1/test_submission.py
import pytest
from unittest.mock import MagicMock
from app.main import app
from app.api import deps
from app.services.queue_manager import queue_manager

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