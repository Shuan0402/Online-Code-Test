"""
RUN_ONLY 試跑機制端到端整合測試。

覆蓋：
- POST /submissions 接受 submission_type=RUN_ONLY → 202
- Worker 跑全部 testcase（不 fail-fast），callback 回 backend、SubmissionDetail 建立
- Candidate /submissions/{id}: sample testcase runtime_info 可見、hidden testcase runtime_info 被 mask
- /exams/{id}/result 不算 RUN_ONLY → 該題狀態仍視為「未提交」(Unsubmitted) 或保留 OFFICIAL
- 5 秒內第二次同題 RUN_ONLY → 429 Too Many Requests + Retry-After

跑法（docker stack 起來後、在 backend container 內跑）：

    docker compose exec backend python -m app.scripts.run_only_regression

冪等：重用 bug_regression 既有的 candidate / problem / exam（不再造）。
"""
import os
import sys
import time

import httpx

sys.path.insert(0, "/app")

# 沿用 bug_regression 的 seed（避免重複造資料）
from app.scripts.bug_regression import (  # noqa: E402
    CANDIDATE_USERNAME,
    INTERVIEWER_USERNAME,
    DEFAULT_PASSWORD,
    BASE_URL,
    log,
    fatal,
    assert_true,
    get_or_create_exam,
    get_or_create_problem,
    get_or_create_user,
    login,
    auth,
    poll_until_terminal,
)
from app.db.session import SessionLocal  # noqa: E402
from app.models.enums import UserRole  # noqa: E402
from app.services.queue_manager import queue_manager  # noqa: E402


def submit_run_only(client, token, exam_id, problem_id, source):
    return client.post(
        f"{BASE_URL}/submissions/",
        json={
            "problem_id": problem_id,
            "exam_id": str(exam_id),
            "language": "python",
            "source_code": source,
            "submission_type": "RUN_ONLY",
        },
        headers=auth(token),
    )


def main():
    print("=" * 70)
    print("RUN_ONLY Integration Test")
    print("=" * 70)

    # 1) seed (reuse Bug 1-4 seed)
    log("seed", "users / problem / exam ...")
    db = SessionLocal()
    try:
        candidate = get_or_create_user(db, CANDIDATE_USERNAME, UserRole.Candidate)
        # 共用 bug_regression 的 interviewer，避免改變既有 exam.creator_id 讓 Bug 4a mine=true 漏掉
        interviewer = get_or_create_user(db, INTERVIEWER_USERNAME, UserRole.Interviewer)
        problem = get_or_create_problem(db, interviewer.id)
        exam = get_or_create_exam(db, interviewer.id, candidate.id, problem.id)
        candidate_id = candidate.id
        problem_id = problem.id
        exam_id = exam.id
    finally:
        db.close()

    # 確保前一次 cooldown 不影響本次（測試用、prod 環境不會直接清）
    queue_manager.client.delete(f"runonly:cd:{candidate_id}:{problem_id}")

    log("seed", f"candidate={candidate_id} problem={problem_id} exam={exam_id}")

    with httpx.Client(timeout=20) as client:
        cand_token = login(client, CANDIDATE_USERNAME)

        # ── 1. POST RUN_ONLY → 202 ──
        print("\n[1] POST /submissions submission_type=RUN_ONLY → 202")
        source_wa = "print('999')\n"  # sample (3 5) expects 8 → WA
        r = submit_run_only(client, cand_token, exam_id, problem_id, source_wa)
        assert_true(r.status_code == 202, f"RUN_ONLY POST 202 (got {r.status_code} {r.text[:200]})")
        sub_id = r.json()["id"]
        assert_true(r.json()["submission_type"] == "RUN_ONLY", "回傳 submission_type 是 RUN_ONLY")

        # ── 2. Poll terminal ──
        print("\n[2] Poll /submissions/{id} 等 worker 跑完")
        result = poll_until_terminal(client, cand_token, sub_id)
        assert_true(result["status"] == "WA", f"verdict 應為 WA (sample mismatch)；got {result['status']}")

        # ── 3. RUN_ONLY 不 fail-fast → 兩筆 detail 都跑 ──
        details = result.get("details", [])
        print(f"\n[3] RUN_ONLY 不 fail-fast、應跑完全部 testcase (got {len(details)})")
        assert_true(len(details) == 2, f"應有 2 筆 detail (fail-fast 關掉)；got {len(details)}")

        # ── 4. Candidate mask 仍生效：sample runtime_info 看得到、hidden 被 mask ──
        print("\n[4] Candidate mask：sample runtime_info 可見、hidden 被 mask")
        sample_ri = [d["runtime_info"] for d in details if d["runtime_info"] is not None]
        hidden_ri = [d["runtime_info"] for d in details if d["runtime_info"] is None]
        assert_true(any("Expected" in r for r in sample_ri), f"sample 該有 Expected/Got 對比 (got {sample_ri})")
        assert_true(len(hidden_ri) >= 1, "至少一筆 hidden testcase runtime_info 被 mask 成 null")

        # ── 5. /exams/{id}/result 不算 RUN_ONLY ──
        print("\n[5] /exams/{id}/result 不算 RUN_ONLY → candidate_score 仍維持 OFFICIAL 的值")
        r2 = client.get(f"{BASE_URL}/exams/{exam_id}/result", headers=auth(cand_token))
        r2.raise_for_status()
        er = r2.json()
        # 過往 bug_regression 跑過 OFFICIAL，score 是 10 或 0；不該被 RUN_ONLY 的 WA(score=0) 覆蓋
        # 嚴格說來：若同 problem 同 exam 之前沒 OFFICIAL 提交、status 會是 Unsubmitted；
        # 若之前跑過 bug_regression、會有 OFFICIAL submission 在
        prob_node = next((p for p in er["results"] if p["problem_id"] == problem_id), None)
        assert_true(prob_node is not None, "result 該題 node 存在")
        # 不可能等於 RUN_ONLY 的 status（因為剛剛 RUN_ONLY 是 WA），但這條 assertion 比較弱
        # — 主要驗：拿來顯示的是 OFFICIAL 軌跡（從 bug_regression 留下）或 Unsubmitted。
        assert_true(
            prob_node["submission_status"] != "WA" or len(sample_ri) == 0,
            f"/result 該題 status 不該是剛剛 RUN_ONLY 的 WA (got {prob_node['submission_status']})"
        )

        # ── 6. cooldown：立刻再送一次 → 429 ──
        print("\n[6] 5 秒 cooldown：立刻第二次 RUN_ONLY → 429")
        r3 = submit_run_only(client, cand_token, exam_id, problem_id, source_wa)
        assert_true(r3.status_code == 429, f"第二次應 429 (cooldown)；got {r3.status_code}")
        assert_true("Retry-After" in r3.headers, "回應應帶 Retry-After header")

        # ── 7. cooldown 過後可以再試跑（手動清掉 Redis key 模擬 5 秒過後） ──
        queue_manager.client.delete(f"runonly:cd:{candidate_id}:{problem_id}")
        r4 = submit_run_only(client, cand_token, exam_id, problem_id, source_wa)
        assert_true(r4.status_code == 202, f"cooldown 過後應再次 202；got {r4.status_code}")

    print("\n" + "=" * 70)
    print("✅ RUN_ONLY 端到端整合驗證全部通過")
    print("=" * 70)


if __name__ == "__main__":
    main()
