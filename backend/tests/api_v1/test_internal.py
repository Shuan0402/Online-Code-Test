"""
POST /internal/judge-callback 測試。

驗合約 3/4：
- X-Worker-Secret auth
- 兩層 idempotency (PK + UPDATE WHERE status IN guard)
- partial credit score (sum AC weights)
- overall verdict precedence (CE > RE > MLE > TLE > WA > AC)
- unknown / 已 finalize / duplicate callback 一律 silent 200
"""

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.submission import Submission
from app.models.enums import JudgeStatus
from app.models.user import User
from app.schemas.submission import CallbackTestcase
from app.services.judging import aggregate_verdict, calc_score


# ── fixtures ────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def worker_secret_env(monkeypatch):
    """每個 test 設 WORKER_SECRET、結束 monkeypatch 自動清。"""
    monkeypatch.setenv("WORKER_SECRET", "test-secret")


@pytest.fixture
def pending_submission(db_session: Session, candidate_user: User, create_test_problem):
    """建一筆 Pending submission、配 2 個 testcase（weight 30/70 = 100 分）。"""
    problem = create_test_problem(
        title="Add Two",
        test_cases_data=[
            {"input_data": "1 2", "expected_output": "3", "is_sample": True, "score_weight": 30},
            {"input_data": "5 7", "expected_output": "12", "is_sample": False, "score_weight": 70},
        ],
    )
    sub = Submission(
        user_id=candidate_user.id,
        problem_id=problem.id,
        language="python",
        code_s3_url="s3://test/sub.py",
        status=JudgeStatus.Pending,
    )
    db_session.add(sub)
    db_session.commit()
    db_session.refresh(sub)
    return sub, problem


def _callback_payload(sub_id, per_testcase, exec_time_ms=50, judge_log=""):
    return {
        "submission_id": str(sub_id),
        "per_testcase": per_testcase,
        "exec_time_ms": exec_time_ms,
        "memory_mb": None,
        "judge_log": judge_log,
    }


HEADERS_OK = {"X-Worker-Secret": "test-secret"}


# ── endpoint tests ──────────────────────────────────────────────────


def test_callback_all_ac_writes_verdict_and_full_score(
    client: TestClient, pending_submission, db_session: Session
):
    sub, problem = pending_submission
    tc1, tc2 = problem.test_cases
    payload = _callback_payload(sub.id, [
        {"testcase_id": tc1.id, "case_verdict": "AC", "exec_time_ms": 12},
        {"testcase_id": tc2.id, "case_verdict": "AC", "exec_time_ms": 45},
    ], exec_time_ms=45)

    resp = client.post("/api/v1/internal/judge-callback", json=payload, headers=HEADERS_OK)

    assert resp.status_code == 200
    db_session.refresh(sub)
    assert sub.status == JudgeStatus.AC
    assert sub.score == 100   # 30 + 70
    assert sub.execution_time == 45


def test_callback_fail_fast_partial_score(
    client: TestClient, pending_submission, db_session: Session
):
    """tc1 AC、tc2 WA、fail-fast 後 per_testcase len=2、score 只算 AC 那筆。"""
    sub, problem = pending_submission
    tc1, tc2 = problem.test_cases
    payload = _callback_payload(sub.id, [
        {"testcase_id": tc1.id, "case_verdict": "AC", "exec_time_ms": 12},
        {"testcase_id": tc2.id, "case_verdict": "WA", "exec_time_ms": 8},
    ], exec_time_ms=12)

    resp = client.post("/api/v1/internal/judge-callback", json=payload, headers=HEADERS_OK)

    assert resp.status_code == 200
    db_session.refresh(sub)
    assert sub.status == JudgeStatus.WA
    assert sub.score == 30   # 只算 tc1


def test_callback_idempotent_on_duplicate(
    client: TestClient, pending_submission, db_session: Session
):
    """同 callback POST 兩次：第二次 silent 200、DB 跟第一次一樣。"""
    sub, problem = pending_submission
    tc1, tc2 = problem.test_cases
    payload = _callback_payload(sub.id, [
        {"testcase_id": tc1.id, "case_verdict": "AC", "exec_time_ms": 12},
        {"testcase_id": tc2.id, "case_verdict": "AC", "exec_time_ms": 45},
    ])

    r1 = client.post("/api/v1/internal/judge-callback", json=payload, headers=HEADERS_OK)
    assert r1.status_code == 200
    db_session.refresh(sub)
    score_after_first = sub.score
    status_after_first = sub.status

    # 第二次來、應 silent 200、DB 不被改
    r2 = client.post("/api/v1/internal/judge-callback", json=payload, headers=HEADERS_OK)
    assert r2.status_code == 200
    db_session.refresh(sub)
    assert sub.score == score_after_first
    assert sub.status == status_after_first


def test_callback_after_already_finalized_is_noop(
    client: TestClient, pending_submission, db_session: Session
):
    """submission 已被改成 AC 之後、再來一個 WA callback、不該蓋掉。"""
    sub, problem = pending_submission
    sub.status = JudgeStatus.AC
    sub.score = 100
    db_session.commit()

    tc1, _ = problem.test_cases
    payload = _callback_payload(sub.id, [
        {"testcase_id": tc1.id, "case_verdict": "WA", "exec_time_ms": 8},
    ])

    resp = client.post("/api/v1/internal/judge-callback", json=payload, headers=HEADERS_OK)

    assert resp.status_code == 200
    db_session.refresh(sub)
    assert sub.status == JudgeStatus.AC
    assert sub.score == 100


def test_callback_unknown_submission_id_returns_200(
    client: TestClient, pending_submission
):
    """submission_id 不存在 DB → rowcount=0 → silent 200（避免 worker 卡 retry）。"""
    _, problem = pending_submission
    tc1, _ = problem.test_cases
    payload = _callback_payload(uuid.uuid4(), [
        {"testcase_id": tc1.id, "case_verdict": "AC", "exec_time_ms": 1},
    ])

    resp = client.post("/api/v1/internal/judge-callback", json=payload, headers=HEADERS_OK)

    assert resp.status_code == 200


def test_callback_without_secret_returns_401(client: TestClient, pending_submission):
    sub, problem = pending_submission
    tc1, _ = problem.test_cases
    payload = _callback_payload(sub.id, [
        {"testcase_id": tc1.id, "case_verdict": "AC", "exec_time_ms": 1},
    ])

    resp = client.post("/api/v1/internal/judge-callback", json=payload)

    assert resp.status_code == 401


def test_callback_with_wrong_secret_returns_401(client: TestClient, pending_submission):
    sub, problem = pending_submission
    tc1, _ = problem.test_cases
    payload = _callback_payload(sub.id, [
        {"testcase_id": tc1.id, "case_verdict": "AC", "exec_time_ms": 1},
    ])

    resp = client.post(
        "/api/v1/internal/judge-callback",
        json=payload,
        headers={"X-Worker-Secret": "wrong"},
    )

    assert resp.status_code == 401


# ── judging service unit tests ──────────────────────────────────────


def test_aggregate_verdict_precedence_tle_beats_wa():
    """precedence: CE > RE > MLE > TLE > WA > AC。"""
    per_tc = [
        CallbackTestcase(testcase_id=1, case_verdict="AC", exec_time_ms=10),
        CallbackTestcase(testcase_id=2, case_verdict="WA", exec_time_ms=20),
        CallbackTestcase(testcase_id=3, case_verdict="TLE", exec_time_ms=1000),
    ]
    assert aggregate_verdict(per_tc) == JudgeStatus.TLE


def test_aggregate_verdict_all_ac():
    per_tc = [
        CallbackTestcase(testcase_id=1, case_verdict="AC", exec_time_ms=10),
        CallbackTestcase(testcase_id=2, case_verdict="AC", exec_time_ms=20),
    ]
    assert aggregate_verdict(per_tc) == JudgeStatus.AC


def test_aggregate_verdict_ce_beats_everything():
    per_tc = [
        CallbackTestcase(testcase_id=1, case_verdict="CE", exec_time_ms=0),
    ]
    assert aggregate_verdict(per_tc) == JudgeStatus.CE


def test_aggregate_verdict_empty_is_re():
    """防呆：worker 沒成功跑任何 testcase → RE。"""
    assert aggregate_verdict([]) == JudgeStatus.RE


def test_calc_score_partial_credit():
    per_tc = [
        CallbackTestcase(testcase_id=1, case_verdict="AC", exec_time_ms=10),
        CallbackTestcase(testcase_id=2, case_verdict="WA", exec_time_ms=20),
        CallbackTestcase(testcase_id=3, case_verdict="AC", exec_time_ms=30),
    ]
    weights = {1: 30, 2: 30, 3: 40}
    assert calc_score(per_tc, weights) == 70   # tc1 + tc3


def test_calc_score_missing_weight_is_zero():
    """testcase_id 在 weights dict 找不到時、不爆、視為 0。"""
    per_tc = [CallbackTestcase(testcase_id=999, case_verdict="AC", exec_time_ms=10)]
    assert calc_score(per_tc, {}) == 0
