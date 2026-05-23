from datetime import datetime, timedelta
from app.models.enums import ExamStatus, JudgeStatus
from app.models.exam import ExamProblem

# --- GET /dashboard/summary (取得儀錶板) ---
def test_get_dashboard_summary_as_admin(client, override_auth, admin_user):
    """
    以 Admin 身份戳端點，應成功獲取所有維運健康指標
    """
    override_auth(admin_user)
    
    response = client.get("/api/v1/admin/dashboard/summary")
    assert response.status_code == 200
    
    data = response.json()
    assert "active_candidates_count" in data
    assert "active_exams_count" not in data
    assert "system_hardware" in data
    assert data["system_hardware"]["cpu_usage_percent"] >= 0
    assert "pending_tasks_count" in data


def test_get_dashboard_summary_as_candidate_denied(client, override_auth, candidate_user):
    """
    一般考生企圖偷看系統監控，系統應回傳 403
    """
    override_auth(candidate_user)
    
    response = client.get("/api/v1/admin/dashboard/summary")

    assert response.status_code == 403
    assert "權限不足" in response.json()["detail"]

# --- GET /dashboard/anomalies (取得異常提交) ---
def test_get_dashboard_anomalies_success(client, override_auth, admin_user, create_test_user, create_test_problem, create_test_exam, create_mock_submission, db_session):
    """
    統發生 RE 異常提交時，Admin 應能成功透過多表聯查，獲取對齊詳細審計抽屜的指標。
    """
    override_auth(admin_user)
    
    student = create_test_user(username="test_student", full_name="test_name")
    prob = create_test_problem(title="test_problem_title")
    exam = create_test_exam(title="test_exam_title", candidate_id=student.id, status=ExamStatus.Ongoing)
    
    ep = ExamProblem(exam_id=exam.id, problem_id=prob.id, sequence=1, points=100)
    db_session.add(ep)
    db_session.commit()
    
    mock_sub = create_mock_submission(user_id=student.id, problem_id=prob.id, status="RE", score=0)
    
    mock_sub.exam_id = exam.id
    mock_sub.client_ip = "140.124.10.25"
    mock_sub.judge_log = "Segmentation fault (core dumped). SIGSEGV address boundary error."
    db_session.commit()

    response = client.get("/api/v1/admin/dashboard/anomalies?page=1&size=10")
    assert response.status_code == 200
    
    data = response.json()
    assert data["total"] >= 1
    assert len(data["items"]) >= 1
    
    anomaly_item = data["items"][0]
    assert anomaly_item["exam_name"] == "test_exam_title"
    assert anomaly_item["exam_id"] == str(exam.id)
    assert anomaly_item["problem_name"] == "test_problem_title"
    assert anomaly_item["problem_id"] == prob.id
    assert "submitted_at" in anomaly_item
    assert anomaly_item["username"] == "test_student"
    assert anomaly_item["candidate_name"] == "test_name"
    assert anomaly_item["verdict"] == "RE"
    assert anomaly_item["client_ip"] == "140.124.10.25"
    assert "SIGSEGV" in anomaly_item["error_detail"]


def test_get_dashboard_anomalies_pagination_and_sorting(client, override_auth, admin_user, candidate_user, create_test_problem, create_test_exam, create_mock_submission, db_session):
    """
    分頁與排序驗證：建立多筆異常提交
    - 驗證最新發生的異常排在數組第一個
    - 驗證分頁 size 參數能精準卡控回傳數量
    """
    override_auth(admin_user)
    prob = create_test_problem()
    exam = create_test_exam(candidate_id=candidate_user.id, status=ExamStatus.Ongoing)
    
    sub1 = create_mock_submission(user_id=candidate_user.id, problem_id=prob.id, status="TLE")
    sub1.exam_id = exam.id
    sub1.created_at = datetime.now() - timedelta(minutes=10)
    
    sub2 = create_mock_submission(user_id=candidate_user.id, problem_id=prob.id, status="MLE")
    sub2.exam_id = exam.id
    sub2.created_at = datetime.now()
    
    db_session.commit()

    response = client.get("/api/v1/admin/dashboard/anomalies?page=1&size=1")
    assert response.status_code == 200
    
    data = response.json()
    assert len(data["items"]) == 1
    assert data["items"][0]["verdict"] == "MLE"


def test_get_dashboard_anomalies_candidate_denied(client, override_auth, candidate_user):
    """
    一般 Candidate 考生企圖越權窺探維運流水燈，回傳 403 Forbidden 阻擋。
    """
    override_auth(candidate_user)

    response = client.get("/api/v1/admin/dashboard/anomalies")

    assert response.status_code == 403
    assert "權限不足" in response.json()["detail"]


def test_get_dashboard_anomalies_includes_judge_failed_with_reason(
    client, override_auth, admin_user, candidate_user,
    create_test_problem, create_test_exam, create_mock_submission, db_session,
):
    """Step 9: JudgeFailed submission 也算 anomaly、failure_reason 完整可讀。"""
    override_auth(admin_user)

    prob = create_test_problem(title="boom problem")
    exam = create_test_exam(candidate_id=candidate_user.id, status=ExamStatus.Ongoing)

    sub = create_mock_submission(user_id=candidate_user.id, problem_id=prob.id, status="JudgeFailed")
    sub.exam_id = exam.id
    sub.failure_reason = "SpawnerError('docker daemon connection refused')\nTraceback ..."
    db_session.commit()

    response = client.get("/api/v1/admin/dashboard/anomalies?page=1&size=20")
    assert response.status_code == 200

    data = response.json()
    judge_failed_items = [item for item in data["items"] if item["verdict"] == "JudgeFailed"]
    assert len(judge_failed_items) >= 1

    item = judge_failed_items[0]
    assert item["failure_reason"] is not None
    assert "SpawnerError" in item["failure_reason"]
    assert "docker daemon" in item["failure_reason"]