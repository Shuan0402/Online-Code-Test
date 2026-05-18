import json
import uuid

from app.models.enums import UserRole
from app.models.testcase import TestCase
from app.models.enums import JudgeStatus
from app.models.submission import Submission
from app.core.redis_client import redis_client # 測試端依然可以直接用 redis_client 驗票
from app.services.queue_manager import queue_manager # 🚀 引入來比對常量


# --- GET /problems/{id}/testcases (獲得完整測資) ---
def test_get_problem_testcases_success(client, questioner_user, override_auth, create_test_problem, db_session):
    """
    出題者取得題目測資。
    """
    override_auth(questioner_user)
    prob = create_test_problem(title="測資測試題")
    
    response = client.get(f"/api/v1/problems/{prob.id}/testcases")

    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_get_problem_testcases_candidate_blocked(client, candidate_user, override_auth, create_test_problem):
    """
    普通考生禁止窺探完整測資。
    """
    override_auth(candidate_user)
    prob = create_test_problem()
    
    response = client.get(f"/api/v1/problems/{prob.id}/testcases")

    assert response.status_code == 403

# --- POST /problems/{id}/testcases (建立測資) ---
def test_create_problem_testcase_success(client, questioner_user, override_auth, create_test_problem):
    """
    出題者成功為題目建立全新測資。
    """
    override_auth(questioner_user)
    prob = create_test_problem(title="增量功能測試題")
    
    payload = {
        "input_data": "5\n1 2 3 4 5",
        "expected_output": "15",
        "score_weight": 25,
        "is_sample": False
    }
    
    response = client.post(f"/api/v1/problems/{prob.id}/testcases", json=payload)
    
    assert response.status_code == 201
    data = response.json()
    assert data["problem_id"] == prob.id
    assert data["input_data"] == payload["input_data"]
    assert data["expected_output"] == payload["expected_output"]
    assert data["score_weight"] == 25
    assert data["is_sample"] is False
    assert "id" in data


def test_create_problem_testcase_candidate_blocked(client, candidate_user, override_auth, create_test_problem):
    """
    普通考生禁止塞入自訂測資
    """
    override_auth(candidate_user)
    prob = create_test_problem()
    
    payload = {
        "input_data": "惡意攻擊輸入",
        "expected_output": "無所謂",
        "score_weight": 100
    }
    
    response = client.post(f"/api/v1/problems/{prob.id}/testcases", json=payload)

    assert response.status_code == 403

# --- PATCH /testcases/{id} (修改測資) ---
def test_update_testcase_success(client, questioner_user, override_auth, create_test_problem, db_session):
    """
    出題者成功修改指定測資的部分欄位
    """
    override_auth(questioner_user)
    prob = create_test_problem()
    
    from app.models.testcase import TestCase
    tc = TestCase(
        problem_id=prob.id,
        input_data="OLD_INPUT",
        expected_output="OLD_OUTPUT",
        score_weight=10,
        is_sample=True
    )
    db_session.add(tc)
    db_session.commit()
    db_session.refresh(tc)
    
    payload = {
        "input_data": "NEW_INPUT",
        "score_weight": 99
    }
    
    response = client.patch(f"/api/v1/testcases/{tc.id}", json=payload)
    assert response.status_code == 200
    
    data = response.json()
    assert data["id"] == tc.id
    assert data["input_data"] == "NEW_INPUT"
    assert data["score_weight"] == 99 
    assert data["expected_output"] == "OLD_OUTPUT"
    assert data["is_sample"] is True


def test_update_testcase_candidate_blocked(client, candidate_user, override_auth, db_session, create_test_problem):
    """
    考生禁止修改任何測資
    """
    override_auth(candidate_user)
    prob = create_test_problem()
    
    from app.models.testcase import TestCase
    tc = TestCase(problem_id=prob.id, input_data="IN", expected_output="OUT")
    db_session.add(tc)
    db_session.commit()
    
    response = client.patch(f"/api/v1/testcases/{tc.id}", json={"score_weight": 100})
    assert response.status_code == 403

# --- DELETE /testcases/{id} (刪除測資) ---
def test_delete_testcase_success(client, questioner_user, override_auth, create_test_problem, db_session):
    """
    出題者成功刪除指定測資，且資料庫同步抹除
    """
    override_auth(questioner_user)
    prob = create_test_problem()
    
    tc = TestCase(problem_id=prob.id, input_data="DELETE_ME", expected_output="OUT")
    db_session.add(tc)
    db_session.commit()
    db_session.refresh(tc)
    
    response = client.delete(f"/api/v1/testcases/{tc.id}")
    assert response.status_code == 204
    
    db_session.expire_all()
    deleted_tc = db_session.query(TestCase).filter(TestCase.id == tc.id).first()
    assert deleted_tc is None


def test_delete_testcase_candidate_blocked(client, candidate_user, override_auth, create_test_problem, db_session):
    """
    考生禁止刪除任何測資
    """
    override_auth(candidate_user)
    prob = create_test_problem()
    
    tc = TestCase(problem_id=prob.id, input_data="SAFE_DATA", expected_output="OUT")
    db_session.add(tc)
    db_session.commit()
    
    response = client.delete(f"/api/v1/testcases/{tc.id}")
    assert response.status_code == 403

# --- POST /problems/{id}/rejudge (重新評測) ---
def test_rejudge_problem_submissions_queue_push_success(
    client, questioner_user, override_auth, create_test_problem, create_test_exam, candidate_user, db_session
):
    """
    驗證 Rejudge 精準推送正確合約的 JSON 到 Redis 佇列中。
    """
    override_auth(questioner_user)
    prob = create_test_problem()
    exam = create_test_exam(candidate_id=candidate_user.id)
    
    sub = Submission(
        id=uuid.uuid4(), user_id=candidate_user.id, problem_id=prob.id, exam_id=exam.id,
        language="python", code_s3_url="s3://dummy/rejudge_test.py", status=JudgeStatus.AC, score=100
    )
    db_session.add(sub)
    db_session.commit()
    
    redis_client.delete(queue_manager.QUEUE_PENDING)

    response = client.post(f"/api/v1/problems/{prob.id}/rejudge")
    assert response.status_code == 202
    
    db_session.refresh(sub)
    assert sub.status == JudgeStatus.Pending
    assert sub.score == 0

    raw_msg = redis_client.lpop(queue_manager.QUEUE_PENDING)
    assert raw_msg is not None
    
    msg_data = json.loads(raw_msg)
    assert msg_data["submission_id"] == str(sub.id)
    assert msg_data["submission_type"] == "OFFICIAL"
    assert isinstance(msg_data["testcases"], list)

def test_rejudge_problem_with_zero_submissions(client, questioner_user, override_auth, create_test_problem):
    """
    當出題者對一隻全新、歷史上「沒有任何考生繳交過」的題目重測，系統應回傳 202。
    """
    override_auth(questioner_user)
    prob = create_test_problem(title="無人交的題目")
    
    redis_client.delete(queue_manager.QUEUE_PENDING)

    response = client.post(f"/api/v1/problems/{prob.id}/rejudge")
    
    assert response.status_code == 202
    data = response.json()
    assert data["submissions_triggered"] == 0
    assert "無需執行重測" in data["message"]
    assert redis_client.llen(queue_manager.QUEUE_PENDING) == 0


def test_rejudge_problem_not_found(client, questioner_user, override_auth):
    """
    故意帶入一個根本不存在的題目 ID  企圖觸發重測，系統應回傳 404 Not Found。
    """
    override_auth(questioner_user)
    
    response = client.post("/api/v1/problems/99999/rejudge")
    assert response.status_code == 404
    assert "找不到指定的題目" in response.json()["detail"]


def test_rejudge_candidate_permission_blocked(client, candidate_user, override_auth, create_test_problem):
    """
    普通考生如果拿到 Token 盲戳重測端點，系統應回傳 403 Forbidden。
    """
    override_auth(candidate_user)
    prob = create_test_problem()

    response = client.post(f"/api/v1/problems/{prob.id}/rejudge")
    
    assert response.status_code == 403