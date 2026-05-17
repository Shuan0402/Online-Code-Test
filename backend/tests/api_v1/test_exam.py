import uuid
from datetime import datetime, timedelta, timezone

from app.models.enums import ExamStatus


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
    
    # 模擬 10 分鐘前就已經開始的考試
    ten_minutes_ago = datetime.now(timezone.utc) - timedelta(minutes=10)
    
    # 🚀 使用工廠：動態塞入 start_time 覆蓋預設行為
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
    # 總長 60 分鐘，過了 10 分鐘，應該剩 50 分鐘 (約 3000 秒)
    assert 2995 <= data["remaining_seconds"] <= 3000


def test_start_exam_auto_submit_when_timeout(client, db_session, candidate_user, override_auth, create_test_exam):
    """
    測試超時防線：若考生試圖作弊卡著網頁，在超時後才觸發 API，系統應自動將狀態變更為 Finished 並拒絕進入。
    """
    override_auth(candidate_user)
    
    # 模擬 2 小時前就開始、但時長只有 60 分鐘的考試（意即已超時 1 小時）
    two_hours_ago = datetime.now(timezone.utc) - timedelta(hours=2)
    
    # 🚀 使用工廠：輕鬆建立超時的考試狀態
    exam = create_test_exam(
        title="限時突擊測驗",
        status=ExamStatus.Ongoing,
        duration_minutes=60,
        start_time=two_hours_ago
    )

    response = client.post(f"/api/v1/exams/{exam.id}/start")
    # 觸發自動收卷機制，回傳 400 Bad Request
    assert response.status_code == 400
    assert "自動收卷" in response.json()["detail"]

    # 驗證資料庫內部狀態確實已被強制變更（此處因需 refresh，仍保留 db_session）
    db_session.refresh(exam)
    assert exam.status == ExamStatus.Finished
    assert exam.end_time is not None