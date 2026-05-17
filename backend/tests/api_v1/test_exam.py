import uuid
from datetime import datetime, timedelta, timezone

from app.models.enums import ExamStatus, DifficultyLevel, UserRole
from app.models.user import User
from app.models.submission import Submission
from app.models.exam import Exam, ExamProblem


# --- GET /exams (考試列表查詢) ---
def test_get_global_exams_as_interviewer_success(client, interviewer_user, override_auth, create_test_exam):
    """
    驗證後台人員呼叫時，能跨越考生邊界，拿到全局所有的考卷。
    """
    override_auth(interviewer_user)
    
    base_time = datetime.now(timezone.utc)
    create_test_exam(title="前端工程師考卷", easy_count=1, created_at=base_time - timedelta(minutes=5))
    create_test_exam(title="後端工程師考卷", easy_count=1, created_at=base_time)

    response = client.get("/api/v1/exams/")
    assert response.status_code == 200
    
    data = response.json()
    assert len(data) >= 2
    assert data[0]["title"] == "後端工程師考卷"


def test_candidate_list_isolation_and_draft_protection(client, candidate_user, interviewer_user, override_auth, create_test_exam, create_test_user):
    """
    學生視角的隱私與草稿防禦。
    """
    other_candidate = create_test_user(role=UserRole.Candidate)

    override_auth(interviewer_user)
    
    create_test_exam(
        title="別人的測驗", 
        candidate_id=other_candidate.id, 
        status=ExamStatus.Ongoing, 
        easy_count=1
    )
    
    create_test_exam(
        title="我的草稿測驗", 
        candidate_id=candidate_user.id, 
        status=ExamStatus.Draft, 
        easy_count=1
    )

    override_auth(candidate_user)
    response = client.get("/api/v1/exams/")
    
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 0

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
    
    ep = ExamProblem(exam_id=exam.id, problem_id=prob.id, sequence=1, points=100, problem=prob)
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
    
    ep = ExamProblem(exam_id=exam.id, problem_id=prob.id, sequence=1, points=100, problem=prob)
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

# --- POST /exams (建立考試) ---
def test_create_exam_session_success(client, interviewer_user, candidate_user, override_auth):
    """
    面試主管成功建立考試，且狀態預設為 Draft。
    """
    override_auth(interviewer_user)
    
    payload = {
        "title": "2026 系統架構師後端實作測驗",
        "duration_minutes": 100,
        "easy_count": 1,
        "medium_count": 2,
        "hard_count": 0,
        "candidate_id": str(candidate_user.id)
    }

    response = client.post("/api/v1/exams/", json=payload)
    assert response.status_code == 201
    
    data = response.json()
    assert data["title"] == payload["title"]
    assert data["status"] == "Draft"
    assert data["creator_id"] == str(interviewer_user.id)
    assert data["candidate_id"] == str(candidate_user.id)


def test_create_exam_forbidden_for_candidate(client, candidate_user, override_auth):
    """
    驗證受測學生（Candidate）如果呼叫建立考卷端點，應回傳 403。
    """
    override_auth(candidate_user)
    
    payload = {
        "title": "學生自己發明的小測驗",
        "duration_minutes": 60,
        "easy_count": 1,
        "candidate_id": str(candidate_user.id)
    }

    response = client.post("/api/v1/exams/", json=payload)
    assert response.status_code == 403
    assert "只有面試官或管理員可以建立" in response.json()["detail"]


def test_create_exam_validation_error_empty_questions(client, interviewer_user, candidate_user, override_auth):
    """
    驗證當 easy/medium/hard 總和為 0 時，Pydantic model_validator 能否回傳 422。
    """
    override_auth(interviewer_user)
    
    payload = {
        "title": "沒有題目的空虛考卷",
        "duration_minutes": 60,
        "easy_count": 0,
        "medium_count": 0,
        "hard_count": 0,
        "candidate_id": str(candidate_user.id)
    }

    response = client.post("/api/v1/exams/", json=payload)
    
    assert response.status_code == 422

# --- POST /exams/{id}/problems/generate (自動抽題) ---
def test_generate_exam_problems_success(client, db_session, interviewer_user, override_auth, create_test_exam, create_test_problem):
    """
    驗證自動抽題功能是否能完美依照難易度配比隨機組裝考卷。
    """
    override_auth(interviewer_user)
    
    p1 = create_test_problem(title="Easy Prob 1", difficulty=DifficultyLevel.Easy)
    p2 = create_test_problem(title="Easy Prob 2", difficulty=DifficultyLevel.Easy)
    p3 = create_test_problem(title="Easy Prob 3", difficulty=DifficultyLevel.Easy)
    
    exam = create_test_exam(
        title="自動組卷期末考",
        status=ExamStatus.Draft,
        easy_count=2,
        medium_count=0,
        hard_count=0
    )

    response = client.post(f"/api/v1/exams/{exam.id}/problems/generate")
    assert response.status_code == 200
    
    data = response.json()
    assert len(data["exam_problems"]) == 2
    assert data["exam_problems"][0]["sequence"] == 1
    assert data["exam_problems"][1]["sequence"] == 2


def test_generate_exam_problems_insufficient_bank(client, interviewer_user, override_auth, create_test_exam, create_test_problem):
    """
    當面試主管要求抽 10 題，但題庫裡只有 1 題時，應回傳 400 Bad Request。
    """
    override_auth(interviewer_user)
    
    create_test_problem(difficulty=DifficultyLevel.Hard)
    
    exam = create_test_exam(status=ExamStatus.Draft, easy_count=0, medium_count=0, hard_count=10)

    response = client.post(f"/api/v1/exams/{exam.id}/problems/generate")
    assert response.status_code == 400
    assert "題目數量不足" in response.json()["detail"]

# --- POST /exams/{id}/publish (發布考試場次) ---
def test_publish_exam_session_success(client, db_session, interviewer_user, override_auth, create_test_exam, create_test_problem):
    """
    面試主管成功發布考卷，驗證在場次具備「抽題藍圖」且「確實配置實體題目」後，狀態能順利流轉為 Published。
    """
    override_auth(interviewer_user)
    
    exam = create_test_exam(
        title="測試測驗",
        status=ExamStatus.Draft,
        easy_count=1,
        medium_count=0,
        hard_count=0
    )
    
    prob = create_test_problem(title="Docker Container Security")
    
    ep = ExamProblem(
        exam_id=exam.id,
        problem_id=prob.id,
        sequence=1,
        points=100,
        problem=prob
    )
    db_session.add(ep)
    db_session.commit()

    response = client.post(f"/api/v1/exams/{exam.id}/publish")
    assert response.status_code == 200
    
    data = response.json()
    assert data["status"] == "Published"
    assert data["exam_problems"][0]["title"] == "Docker Container Security"

    db_session.refresh(exam)
    assert exam.status == ExamStatus.Published


def test_publish_exam_failed_empty_physical_problems(client, interviewer_user, override_auth, create_test_exam):
    """
    驗證當資料庫中間表沒有任何實體題目時，後端會回傳 400 Bad Request。
    """
    override_auth(interviewer_user)
    
    exam = create_test_exam(
        title="忘記按自動抽題的草稿",
        status=ExamStatus.Draft,
        easy_count=1
    )

    response = client.post(f"/api/v1/exams/{exam.id}/publish")
    
    assert response.status_code == 400
    assert "尚未配置任何實體題目" in response.json()["detail"]


def test_publish_exam_forbidden_for_candidate(client, candidate_user, override_auth, create_test_exam):
    """
    驗證受測學生（Candidate）如果企圖越權發布自己的考卷，應回傳 403 Forbidden。
    """
    override_auth(candidate_user)
    exam = create_test_exam(status=ExamStatus.Draft, easy_count=1)

    response = client.post(f"/api/v1/exams/{exam.id}/publish")
    assert response.status_code == 403
    assert "只有面試官或管理員可以發布" in response.json()["detail"]


def test_publish_exam_invalid_transition(client, interviewer_user, override_auth, create_test_exam, create_test_problem, db_session):
    """
    驗證如果考試已經在進行中（Ongoing），不可再次觸發發布端點。
    """
    override_auth(interviewer_user)
    
    exam = create_test_exam(status=ExamStatus.Ongoing, easy_count=1)
    prob = create_test_problem(title="Existing Problem")
    
    ep = ExamProblem(exam_id=exam.id, problem_id=prob.id, sequence=1, points=100, problem=prob)
    db_session.add(ep)
    db_session.commit()

    response = client.post(f"/api/v1/exams/{exam.id}/publish")
    
    assert response.status_code == 400
    assert "只有草稿狀態的考試可以被發布" in response.json()["detail"]


def test_publish_exam_not_found(client, interviewer_user, override_auth):
    """
    帶入不存在的隨機 UUID 執行發布，應回傳 404 Not Found。
    """
    override_auth(interviewer_user)
    fake_id = uuid.uuid4()
    
    response = client.post(f"/api/v1/exams/{fake_id}/publish")
    assert response.status_code == 404
    assert "找不到指定的考試" in response.json()["detail"]

# --- GET /exams/{id} (單一場次詳細調閱) ---
def test_get_single_exam_as_interviewer_any_status(client, interviewer_user, candidate_user, override_auth, create_test_exam):
    """
    驗證面試官可以調閱任何狀態（包含 Draft 草稿）的單一考卷。
    """
    override_auth(interviewer_user)
    exam = create_test_exam(
        title="面試官草稿審查卷", 
        candidate_id=candidate_user.id, 
        status=ExamStatus.Draft,
        easy_count=1
    )

    response = client.get(f"/api/v1/exams/{exam.id}")

    assert response.status_code == 200
    assert response.json()["title"] == "面試官草稿審查卷"


def test_get_single_exam_as_candidate_own_published_success(client, candidate_user, interviewer_user, override_auth, create_test_exam):
    """
    驗證一般考生可以順利調閱指派給自己、且已發布（Published）的考卷。
    """
    override_auth(interviewer_user)
    exam = create_test_exam(
        title="正式派發期末考", 
        candidate_id=candidate_user.id, 
        status=ExamStatus.Published,
        easy_count=1
    )

    override_auth(candidate_user)
    response = client.get(f"/api/v1/exams/{exam.id}")

    assert response.status_code == 200
    assert response.json()["title"] == "正式派發期末考"


def test_get_single_exam_as_candidate_own_draft_forbidden(client, candidate_user, interviewer_user, override_auth, create_test_exam):
    """
    驗證即使考卷指派在該考生名下，只要狀態是 Draft，考生呼叫時應回傳 403。
    """
    override_auth(interviewer_user)
    exam = create_test_exam(
        title="未完成的編輯中考卷", 
        candidate_id=candidate_user.id, 
        status=ExamStatus.Draft,
        easy_count=1
    )

    override_auth(candidate_user)
    response = client.get(f"/api/v1/exams/{exam.id}")

    assert response.status_code == 403
    assert "尚未對考生開放" in response.json()["detail"]


def test_get_single_exam_as_candidate_steal_others_forbidden(client, candidate_user, interviewer_user, override_auth, create_test_exam, create_test_user):
    """
    驗證考生如果企圖透過隨機遞增或竊取 UUID 來查看別人的 Ongoing 考卷，應回傳 403。
    """
    other_candidate = create_test_user(role=UserRole.Candidate)
    
    override_auth(interviewer_user)
    exam = create_test_exam(title="別人的考卷", candidate_id=other_candidate.id, status=ExamStatus.Published)

    override_auth(candidate_user)
    response = client.get(f"/api/v1/exams/{exam.id}")

    assert response.status_code == 403
    assert "無法查看不屬於您的考試" in response.json()["detail"]


def test_get_single_exam_not_found(client, interviewer_user, override_auth):
    """
    帶入隨機不存在的 UUID，系統應回傳 404 Not Found。
    """
    override_auth(interviewer_user)
    fake_id = uuid.uuid4()
    
    response = client.get(f"/api/v1/exams/{fake_id}")
    assert response.status_code == 404
    assert "找不到指定的考試項目" in response.json()["detail"]

# --- PATCH /exams/{id} (修改考試設定) ---
def test_update_exam_session_success(client, interviewer_user, override_auth, create_test_exam, db_session):
    """
    驗證當考試處於 Draft 狀態時，面試官能自由變更 title 與 duration_minutes。
    """
    override_auth(interviewer_user)
    exam = create_test_exam(title="舊的名稱", duration_minutes=60, status=ExamStatus.Draft, easy_count=1)

    payload = {
        "title": "新的名稱",
        "duration_minutes": 180
    }

    response = client.patch(f"/api/v1/exams/{exam.id}", json=payload)
    assert response.status_code == 200
    
    data = response.json()
    assert data["title"] == "新的名稱"
    assert data["duration_minutes"] == 180
    db_session.refresh(exam)
    assert exam.title == "新的名稱"


def test_update_exam_session_failed_non_draft(client, interviewer_user, override_auth, create_test_exam):
    """
    驗證當考卷正在應考，系統應回傳 400 Bad Request。
    """
    override_auth(interviewer_user)
    
    exam = create_test_exam(title="正在考試的正式考卷", status=ExamStatus.Ongoing, easy_count=1)

    payload = {
        "title": "想改的標題"
    }

    response = client.patch(f"/api/v1/exams/{exam.id}", json=payload)
    assert response.status_code == 400
    assert "目前正在考試，無法修改考試資訊" in response.json()["detail"]


def test_update_exam_session_forbidden_for_candidate(client, candidate_user, interviewer_user, override_auth, create_test_exam):
    """
    驗證受測學生沒有權限更動自己的考卷。
    """
    override_auth(interviewer_user)
    exam = create_test_exam(candidate_id=candidate_user.id, status=ExamStatus.Draft, duration_minutes=60, easy_count=1)

    override_auth(candidate_user)
    payload = {
        "duration_minutes": 999
    }

    response = client.patch(f"/api/v1/exams/{exam.id}", json=payload)
    assert response.status_code == 403
    assert "只有面試官或管理員可以修改" in response.json()["detail"]

# --- DELETE /exams/{id} (刪除考試場次) ---
def test_delete_exam_session_success(client, interviewer_user, override_auth, create_test_exam, db_session):
    """
    面試功刪除草稿卷，驗證處於 Draft 狀態的考卷被刪除後，回傳 204，且資料庫中再也查不到該紀錄。
    """
    override_auth(interviewer_user)
    exam = create_test_exam(title="準備丟棄的無用考卷", status=ExamStatus.Draft, easy_count=1)

    response = client.delete(f"/api/v1/exams/{exam.id}")
    assert response.status_code == 204

    deleted_exam = db_session.query(Exam).filter(Exam.id == exam.id).first()
    assert deleted_exam is None


def test_delete_exam_session_failed_ongoing_blocked(client, interviewer_user, override_auth, create_test_exam, db_session):
    """
    驗證當考試已經是 Ongoing 狀態時，面試官也絕對不能強制刪除，應回傳 400。
    """
    override_auth(interviewer_user)
    exam = create_test_exam(title="考生正在考試的考卷", status=ExamStatus.Ongoing, easy_count=1)

    response = client.delete(f"/api/v1/exams/{exam.id}")
    assert response.status_code == 400
    assert "禁止清理操作" in response.json()["detail"]

    db_session.refresh(exam)
    assert exam is not None


def test_delete_exam_forbidden_for_candidate(client, candidate_user, interviewer_user, override_auth, create_test_exam):
    """
   驗證學生不允許調用刪除端點來撤銷自己的考試。
    """
    override_auth(interviewer_user)
    exam = create_test_exam(candidate_id=candidate_user.id, status=ExamStatus.Draft, easy_count=1)

    override_auth(candidate_user)
    response = client.delete(f"/api/v1/exams/{exam.id}")
    
    assert response.status_code == 403
    assert "只有面試官或管理員可以刪除" in response.json()["detail"]