import uuid
from datetime import datetime, timedelta, timezone

from app.models.enums import ExamStatus
from app.models.submission import Submission
from app.models.exam_problem import ExamProblem


# --- GET /exams (考試列表查詢) ---
def test_get_candidate_exams_success(client, db_session, candidate_user, interviewer_user, override_auth, create_test_exam):
    """
    測試考生成功獲取自己的考試清單，且清單中自動過濾掉 Draft（草稿）考卷。
    """
    override_auth(candidate_user)

    exam_published = create_test_exam(title="正式期中考", status=ExamStatus.Published)
    exam_draft = create_test_exam(title="未完工考卷草稿", status=ExamStatus.Draft)

    response = client.get("/api/v1/exams/")
    assert response.status_code == 200
    
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == str(exam_published.id)


def test_get_candidate_exams_isolation(client, db_session, candidate_user, create_test_user, interviewer_user, override_auth, create_test_exam):
    """
    考生不能看到被指派給「其他考生」的考試。
    """
    other_candidate = create_test_user(username="other_student")
    other_exam = create_test_exam(
        title="指派給別人的考試",
        status=ExamStatus.Published,
        creator_id=interviewer_user.id,
        candidate_id=other_candidate.id
    )

    override_auth(candidate_user)
    response = client.get("/api/v1/exams/")
    
    assert response.status_code == 200
    assert len(response.json()) == 0


def test_get_candidate_exams_forbidden_for_interviewer(client, interviewer_user, override_auth):
    """
    面試主管或非考生角色敲此端點，應回傳 403 Forbidden。
    """
    override_auth(interviewer_user)
    response = client.get("/api/v1/exams/")
    
    assert response.status_code == 403
    assert "專供受測考生調閱" in response.json()["detail"]

# --- POST /exams/{exam_id}/start (開始考試) ---
def test_start_exam_success_first_time(client, candidate_user, override_auth, create_test_exam):
    """
    測試考生第一次點擊開始考試：狀態應成功變更為 Ongoing，且拿到剩餘秒數。
    """
    override_auth(candidate_user)
    exam = create_test_exam(
        title="演算法期末考",
        status=ExamStatus.Published,
        duration_minutes=90
    )

    response = client.post(f"/api/v1/exams/{exam.id}/start")
    assert response.status_code == 200
    
    data = response.json()
    assert data["status"] == "Ongoing"
    assert data["start_time"] is not None
    assert 5398 <= data["remaining_seconds"] <= 5400


def test_start_exam_reentry_midway(client, candidate_user, override_auth, create_test_exam):
    """
    測試斷線防線：若考試已在進行中（考生換電腦或重刷頁面），start_time 應維持原樣，但時間會減少。
    """
    override_auth(candidate_user)
    ten_minutes_ago = datetime.now(timezone.utc) - timedelta(minutes=10)
    exam = create_test_exam(
        title="系統專案會考",
        status=ExamStatus.Ongoing,
        duration_minutes=60,
        start_time=ten_minutes_ago
    )

    response = client.post(f"/api/v1/exams/{exam.id}/start")
    assert response.status_code == 200
    
    data = response.json()
    assert data["status"] == "Ongoing"
    assert 2995 <= data["remaining_seconds"] <= 3000


def test_start_exam_auto_submit_when_timeout(client, db_session, candidate_user, override_auth, create_test_exam):
    """
    若考生試圖作弊卡著網頁，在超時後才觸發 API，系統應自動將狀態變更為 Finished 並拒絕進入。
    """
    override_auth(candidate_user)
    two_hours_ago = datetime.now(timezone.utc) - timedelta(hours=2)
    exam = create_test_exam(
        title="限時突擊測驗",
        status=ExamStatus.Ongoing,
        duration_minutes=60,
        start_time=two_hours_ago
    )

    response = client.post(f"/api/v1/exams/{exam.id}/start")
    assert response.status_code == 400
    assert "自動收卷" in response.json()["detail"]

    db_session.refresh(exam)
    assert exam.status == ExamStatus.Finished
    assert exam.end_time is not None

# --- POST /exams/{exam_id}/submit (主動交卷) ---
def test_submit_exam_success(client, db_session, candidate_user, override_auth, create_test_exam):
    """
    測試進行中的考試成功主動交卷：狀態應順利切為 Finished，並記錄 end_time。
    """
    override_auth(candidate_user)
    exam = create_test_exam(
        title="資料庫系統實作考",
        status=ExamStatus.Ongoing,
        start_time=datetime.now(timezone.utc) - timedelta(minutes=30)
    )

    response = client.post(f"/api/v1/exams/{exam.id}/submit")
    
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "Finished"
    assert data["end_time"] is not None
    db_session.refresh(exam)
    assert exam.status == ExamStatus.Finished


def test_submit_exam_reject_if_not_ongoing(client, candidate_user, override_auth, create_test_exam):
    """
    如果考卷還只是 Published（尚未點擊開始），不能直接交卷。
    """
    override_auth(candidate_user)
    exam = create_test_exam(
        title="編譯器大考",
        status=ExamStatus.Published
    )

    response = client.post(f"/api/v1/exams/{exam.id}/submit")
    
    assert response.status_code == 400
    assert "非進行中狀態無法執行交卷" in response.json()["detail"]

# --- GET /{exam_id}/result (獲取指定考試) ---"
def test_get_exam_result_latest_submission_precedence(client, db_session, candidate_user, override_auth, create_test_exam, create_test_problem):
    """
    驗證當同一題有多次提交時，系統是否「只看最新時間戳記」。
    """
    override_auth(candidate_user)
    exam = create_test_exam(title="最新優先測試", status=ExamStatus.Ongoing)
    prob = create_test_problem(title="Two Sum")
    
    ep = ExamProblem(exam_id=exam.id, problem_id=prob.id, sequence=1, points=100)
    if hasattr(ExamProblem, 'title'): ep.title = "Two Sum"
    db_session.add(ep)
    db_session.commit()

    base_time = datetime.now(timezone.utc)
    
    sub_old = Submission(
        id=uuid.uuid4(), exam_id=exam.id, user_id=candidate_user.id, problem_id=prob.id,
        score=100, status="AC", code_s3_url="s3://1", language="python", created_at=base_time - timedelta(minutes=10)
    )
    sub_new = Submission(
        id=uuid.uuid4(), exam_id=exam.id, user_id=candidate_user.id, problem_id=prob.id,
        score=40, status="WA", code_s3_url="s3://2", language="python", created_at=base_time - timedelta(minutes=2)
    )
    db_session.add_all([sub_old, sub_new])
    db_session.commit()

    response = client.get(f"/api/v1/exams/{exam.id}/result")
    assert response.status_code == 200
    
    result_node = response.json()["results"][0]
    assert result_node["candidate_score"] == 40
    assert result_node["submission_status"] == "WA"


def test_get_exam_result_unsubmitted_fallback(client, db_session, candidate_user, override_auth, create_test_exam, create_test_problem):
    """
    驗證學生如果完全沒有上傳過 Code，該題是否會安全顯示 0 分與 "Unsubmitted"。
    """
    override_auth(candidate_user)
    exam = create_test_exam(status=ExamStatus.Ongoing)
    prob = create_test_problem(title="Unsubmitted Problem")
    
    ep = ExamProblem(exam_id=exam.id, problem_id=prob.id, sequence=1, points=100)
    if hasattr(ExamProblem, 'title'): ep.title = "Unsubmitted Problem"
    db_session.add(ep)
    db_session.commit()

    response = client.get(f"/api/v1/exams/{exam.id}/result")
    assert response.status_code == 200
    
    result_node = response.json()["results"][0]
    assert result_node["candidate_score"] == 0
    assert result_node["submission_status"] == "Unsubmitted"


def test_get_exam_result_total_score_aggregation(client, db_session, candidate_user, override_auth, create_test_exam, create_test_problem):
    """
    整卷配分與考生得分的加總邏輯。
    """
    override_auth(candidate_user)
    exam = create_test_exam(status=ExamStatus.Ongoing)
    prob1 = create_test_problem()
    prob2 = create_test_problem()
    
    ep1 = ExamProblem(exam_id=exam.id, problem_id=prob1.id, sequence=1, points=80)
    ep2 = ExamProblem(exam_id=exam.id, problem_id=prob2.id, sequence=2, points=40)
    db_session.add_all([ep1, ep2])
    
    sub1 = Submission(
        id=uuid.uuid4(), exam_id=exam.id, user_id=candidate_user.id, problem_id=prob1.id,
        score=80, status="AC", code_s3_url="s3://3", language="python", created_at=datetime.now(timezone.utc)
    )
    db_session.add(sub1)
    db_session.commit()

    response = client.get(f"/api/v1/exams/{exam.id}/result")
    assert response.status_code == 200
    data = response.json()
    assert data["total_exam_points"] == 120
    assert data["total_candidate_score"] == 80


def test_get_exam_result_forbidden_for_other_candidate(client, candidate_user, create_test_user, override_auth, create_test_exam):
    """
    其餘無關考生嘗試存取別人的成績單，應回傳 403 Forbidden。
    """
    hacker = create_test_user(username="hacker_student")
    exam = create_test_exam(candidate_id=hacker.id, status=ExamStatus.Ongoing)

    override_auth(candidate_user)
    response = client.get(f"/api/v1/exams/{exam.id}/result")
    
    assert response.status_code == 403
    assert "無權調閱" in response.json()["detail"]


def test_get_exam_result_draft_hidden_from_candidate(client, candidate_user, override_auth, create_test_exam):
    """
    如果考試還在 Draft 階段，考生不允許提前調閱結構，應回傳 403。
    """
    exam = create_test_exam(status=ExamStatus.Draft)

    override_auth(candidate_user)
    response = client.get(f"/api/v1/exams/{exam.id}/result")
    
    assert response.status_code == 403
    assert "尚未對外發布" in response.json()["detail"]


def test_get_exam_result_accessible_by_interviewer(client, interviewer_user, candidate_user, override_auth, create_test_exam):
    """
    面試主管有權調閱任何考生的考試戰報。
    """
    exam = create_test_exam(candidate_id=candidate_user.id, status=ExamStatus.Ongoing)

    override_auth(interviewer_user)
    response = client.get(f"/api/v1/exams/{exam.id}/result")
    
    assert response.status_code == 200
    assert response.json()["id"] == str(exam.id)


def test_get_exam_result_not_found(client, candidate_user, override_auth):
    """
    帶入隨機不存在的 UUID，應回傳 404。
    """
    override_auth(candidate_user)
    fake_id = uuid.uuid4()
    response = client.get(f"/api/v1/exams/{fake_id}/result")
    assert response.status_code == 404