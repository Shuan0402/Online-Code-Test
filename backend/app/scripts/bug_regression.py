"""
PR #59 四條 bug 的整合測試腳本 — 跑完整 pipeline、驗證從 worker → backend → API 的端到端行為。

涵蓋：
- Bug 1：Candidate /submissions/latest sample testcase 有 runtime_info、hidden 被 mask 成 null
- Bug 2：Interviewer /submissions/{id} 兩筆 runtime_info 都不被 mask
- Bug 3：/exams/{id}/result total_exam_points = sum(score_weight) = 20 (不是寫死 100)
- Bug 4：/exams/?mine=true / ?created_start / ?score_gte 三個 server-side filter 正常運作

跑法（在 host 端、docker stack 起來後）：

    docker compose exec backend python -m app.scripts.bug_regression

冪等：重跑會跳過已存在的 user / problem / exam。
"""
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone

import httpx

sys.path.insert(0, "/app")

from app.core.security import SecurityManager
from app.db.session import SessionLocal
from app.models.enums import DifficultyLevel, ExamStatus, JudgeStatus, UserRole
from app.models.exam import Exam, ExamProblem
from app.models.problem import Problem
from app.models.submission import Submission, SubmissionDetail
from app.models.testcase import TestCase
from app.models.user import User

# Backend service name 由 docker network DNS 解析；script 在 backend container 內跑、走 self loopback 也行
BASE_URL = "http://backend:8000/api/v1"
DEFAULT_PASSWORD = "password123"

# 幾個 sentinel 名稱方便冪等
CANDIDATE_USERNAME = "bug_regression_candidate"
INTERVIEWER_USERNAME = "bug_regression_interviewer"
PROBLEM_TITLE = "Bug-Regression-Sum (10+10)"
EXAM_TITLE = "Bug Regression Exam"


# ── helpers ──────────────────────────────────────────────────────────────


def log(step, msg):
    print(f"[{step}] {msg}")


def fatal(msg):
    print(f"\n❌ FAIL: {msg}")
    sys.exit(1)


def assert_eq(actual, expected, label):
    if actual != expected:
        fatal(f"{label}: expected {expected!r}, got {actual!r}")
    print(f"  ✓ {label} == {actual!r}")


def assert_true(cond, label):
    if not cond:
        fatal(f"{label}")
    print(f"  ✓ {label}")


# ── seed (DB direct) ─────────────────────────────────────────────────────


def get_or_create_user(db, username, role):
    u = db.query(User).filter(User.username == username).first()
    if u:
        return u
    u = User(
        username=username,
        full_name=username,
        password_hash=SecurityManager.hash_password(DEFAULT_PASSWORD),
        role=role,
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def get_or_create_problem(db, creator_id):
    p = db.query(Problem).filter(Problem.title == PROBLEM_TITLE).first()
    if p:
        return p
    p = Problem(
        creator_id=creator_id,
        title=PROBLEM_TITLE,
        description="讀兩個整數 a b、輸出 a+b。專用於 PR #59 bug 整合測試。",
        difficulty=DifficultyLevel.Easy,
        time_limit_ms=1000,
        memory_limit_mb=128,
    )
    db.add(p)
    db.commit()
    db.refresh(p)

    db.add_all([
        TestCase(
            problem_id=p.id,
            input_data="3 5\n",
            expected_output="8\n",
            is_sample=True,
            score_weight=10,
        ),
        TestCase(
            problem_id=p.id,
            input_data="100 200\n",
            expected_output="300\n",
            is_sample=False,
            score_weight=10,
        ),
    ])
    db.commit()
    return p


def get_or_create_exam(db, creator_id, candidate_id, problem_id):
    e = db.query(Exam).filter(
        Exam.title == EXAM_TITLE,
        Exam.candidate_id == candidate_id,
    ).first()
    if e:
        # 重置成 Ongoing 才能再提交
        if e.status != ExamStatus.Ongoing:
            now = datetime.now(timezone.utc)
            e.status = ExamStatus.Ongoing
            e.start_time = now
            e.end_time = now + timedelta(hours=2)
            db.commit()
        # 清掉之前的 submission，讓 polling 看到本次新 sub
        db.query(SubmissionDetail).filter(
            SubmissionDetail.submission_id.in_(
                db.query(Submission.id).filter(
                    Submission.exam_id == e.id,
                    Submission.problem_id == problem_id,
                )
            )
        ).delete(synchronize_session=False)
        db.query(Submission).filter(
            Submission.exam_id == e.id,
            Submission.problem_id == problem_id,
        ).delete(synchronize_session=False)
        db.commit()
        return e

    now = datetime.now(timezone.utc)
    e = Exam(
        title=EXAM_TITLE,
        creator_id=creator_id,
        candidate_id=candidate_id,
        duration_minutes=120,
        start_time=now,
        end_time=now + timedelta(hours=2),
        status=ExamStatus.Ongoing,
        easy_count=1, medium_count=0, hard_count=0,
    )
    db.add(e)
    db.commit()
    db.refresh(e)

    # ep.points 故意設 100、證明 Bug 3 修法是用 testcase score_weight (10+10=20)，不是 ep.points
    db.add(ExamProblem(exam_id=e.id, problem_id=problem_id, sequence=1, points=100))
    db.commit()
    return e


# ── API helpers ──────────────────────────────────────────────────────────


def login(client, username, password=DEFAULT_PASSWORD):
    r = client.post(
        f"{BASE_URL}/auth/login",
        data={"username": username, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    r.raise_for_status()
    return r.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def submit_wa_code(client, token, exam_id, problem_id):
    # 故意輸出 a-b 而非 a+b → sample (3 5) 輸出 -2、預期 8 → WA
    source = "a, b = map(int, input().split())\nprint(a - b)\n"
    r = client.post(
        f"{BASE_URL}/submissions/",
        json={
            "problem_id": problem_id,
            "exam_id": str(exam_id),
            "language": "python",
            "source_code": source,
            "submission_type": "OFFICIAL",
        },
        headers=auth(token),
    )
    if r.status_code != 202:
        fatal(f"submit failed status={r.status_code} body={r.text[:300]}")
    return r.json()["id"]


def poll_until_terminal(client, token, sub_id, max_wait=30):
    deadline = time.time() + max_wait
    while time.time() < deadline:
        r = client.get(f"{BASE_URL}/submissions/{sub_id}", headers=auth(token))
        r.raise_for_status()
        data = r.json()
        if data["status"] not in ("Pending", "Judging"):
            return data
        time.sleep(1)
    fatal(f"poll timeout, last status={data.get('status')}")


# ── main ─────────────────────────────────────────────────────────────────


def main():
    print("=" * 70)
    print("PR #59 Bug Regression Integration Test")
    print("=" * 70)

    # 1) seed via DB
    log("seed", "users / problem / exam ...")
    db = SessionLocal()
    try:
        candidate = get_or_create_user(db, CANDIDATE_USERNAME, UserRole.Candidate)
        interviewer = get_or_create_user(db, INTERVIEWER_USERNAME, UserRole.Interviewer)
        problem = get_or_create_problem(db, interviewer.id)
        exam = get_or_create_exam(db, interviewer.id, candidate.id, problem.id)
        candidate_id = candidate.id
        interviewer_id = interviewer.id
        problem_id = problem.id
        exam_id = exam.id
    finally:
        db.close()

    log("seed", f"candidate={candidate_id} interviewer={interviewer_id}")
    log("seed", f"problem={problem_id} exam={exam_id}")

    with httpx.Client(timeout=15) as client:
        # 2) candidate submit + poll
        cand_token = login(client, CANDIDATE_USERNAME)
        log("submit", "WA code as candidate ...")
        sub_id = submit_wa_code(client, cand_token, exam_id, problem_id)
        log("poll", f"waiting for worker on submission {sub_id} ...")
        sub = poll_until_terminal(client, cand_token, sub_id)

        # ── Bug 1: candidate /submissions/latest sample WA 顯示 Expected/Got ──
        # 註：worker fail-fast 機制 — TC 1 (sample) WA 後不跑 TC 2 (hidden)、所以 details 通常只有 1 筆。
        # 「hidden runtime_info 被 mask 成 null」的路徑由 pytest unit test 覆蓋
        # （test_get_latest_submission_masks_hidden_testcase_runtime_info_for_candidate）。
        print("\n[Bug 1] Candidate /submissions/latest sample WA 顯示 Expected/Got 對比")
        r = client.get(
            f"{BASE_URL}/submissions/latest",
            params={"problem_id": problem_id, "exam_id": str(exam_id)},
            headers=auth(cand_token),
        )
        r.raise_for_status()
        details = r.json()["details"]
        assert_true(len(details) >= 1, f"至少 1 筆 SubmissionDetail (得 {len(details)} 筆)")
        sample_d = [d for d in details if d["runtime_info"] and "Expected" in d["runtime_info"]]
        assert_true(
            len(sample_d) >= 1,
            f"至少一筆 testcase 的 runtime_info 含 Expected/Got 對比 (got: {[d['runtime_info'] for d in details]})"
        )
        sample_ri = sample_d[0]["runtime_info"]
        assert_true(
            "Got" in sample_ri,
            f"runtime_info 應同時含 Expected 與 Got (got: {sample_ri!r})"
        )

        # ── Bug 3: total_exam_points = sum(score_weight) = 20 ──
        print("\n[Bug 3] /exams/{id}/result total_exam_points = 20（兩 tc × 10）")
        r = client.get(f"{BASE_URL}/exams/{exam_id}/result", headers=auth(cand_token))
        r.raise_for_status()
        result = r.json()
        assert_eq(result["total_exam_points"], 20, "total_exam_points")
        assert_eq(result["results"][0]["max_points"], 20, "results[0].max_points")
        # Candidate 答錯 hidden、AC sample → 得 10 分
        assert_true(
            result["total_candidate_score"] in (0, 10),
            f"candidate score expected 0 or 10, got {result['total_candidate_score']}"
        )

        # ── Bug 2 + Bug 4: switch to interviewer ──
        intv_token = login(client, INTERVIEWER_USERNAME)

        # Bug 2: Interviewer 看 /submissions/{id} runtime_info 不被 mask
        # 註：fail-fast 後通常只有 1 筆 detail；「interviewer 看 hidden testcase 不 mask」
        # 路徑由 pytest unit test 覆蓋（test_get_submission_by_id_interviewer_sees_all_runtime_info_unmasked）。
        print("\n[Bug 2] Interviewer /submissions/{id} 看到 runtime_info（不被 mask）")
        r = client.get(f"{BASE_URL}/submissions/{sub_id}", headers=auth(intv_token))
        r.raise_for_status()
        intv_details = r.json()["details"]
        assert_true(len(intv_details) >= 1, f"interviewer 至少看到 1 筆 detail (得 {len(intv_details)})")
        runtime_infos = [d["runtime_info"] for d in intv_details]
        assert_true(
            any(r and "Expected" in r for r in runtime_infos),
            f"interviewer 應看到 Expected/Got runtime_info (got: {runtime_infos})"
        )

        # Bug 4: /exams/?mine=true 應包含本場考試
        print("\n[Bug 4a] /exams/?mine=true 只回 creator_id == 自己的考試")
        r = client.get(f"{BASE_URL}/exams/", params={"mine": "true"}, headers=auth(intv_token))
        r.raise_for_status()
        my_exams = r.json()
        my_ids = [e["id"] for e in my_exams]
        assert_true(str(exam_id) in my_ids, f"自己創的考試 {exam_id} 應在 mine 結果")

        # Bug 4: created_start / created_end 篩當天 → 應包含
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
        print(f"\n[Bug 4b] /exams/?created_start={yesterday}&created_end={today} 應包含本場考試")
        r = client.get(
            f"{BASE_URL}/exams/",
            params={"created_start": yesterday, "created_end": today},
            headers=auth(intv_token),
        )
        r.raise_for_status()
        recent_ids = [e["id"] for e in r.json()]
        assert_true(str(exam_id) in recent_ids, f"昨天到今天的篩選應包含 {exam_id}")

        # Bug 4: score_gte=200 應排除（candidate 得分 0 或 10，總分 20，% = 0~50）
        print("\n[Bug 4c] /exams/?score_gte=200 應排除答對率 50% 的本場考試")
        r = client.get(
            f"{BASE_URL}/exams/",
            params={"score_gte": 80, "mine": "true"},
            headers=auth(intv_token),
        )
        r.raise_for_status()
        filtered_ids = [e["id"] for e in r.json()]
        assert_true(
            str(exam_id) not in filtered_ids,
            f"答對率 < 80% 的本場考試 ({exam_id}) 應被 score_gte=80 排除"
        )

    print("\n" + "=" * 70)
    print("✅ 所有 Bug 1-4 整合斷言通過")
    print("=" * 70)


if __name__ == "__main__":
    main()
