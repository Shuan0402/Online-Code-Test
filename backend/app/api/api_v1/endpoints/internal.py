"""
Internal endpoints — 不對 user 開放、worker 等內部服務 callback 用。

合約 3 / 4：
- POST /internal/judge-callback：worker 判完 / 跑到 fail-fast break 後送結果回 backend
- 認證：X-Worker-Secret header
- 兩層 idempotency：
    Layer 1 = Submission.id PK 自動 unique
    Layer 2 = UPDATE WHERE status IN ('Pending','Judging') guard
              rowcount=0 一律 silent 200（重複 callback / submission 不存在 / 已 finalize）
"""

import logging

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api import deps
from app.api.deps import verify_worker_secret
from app.models.submission import SubmissionDetail
from app.models.testcase import TestCase
from app.models.enums import JudgeStatus
from app.schemas.submission import JudgeCallbackPayload
from app.services.judging import aggregate_verdict, calc_score


log = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/judge-callback",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(verify_worker_secret)],
)
def judge_callback(
    payload: JudgeCallbackPayload,
    db: Session = Depends(deps.get_db),
):
    # Step 9：根據 verdict 分兩條路徑、共用 `WHERE status IN ('Pending','Judging')` guard。
    if payload.verdict == "JudgeFailed":
        result = db.execute(
            text("""
                UPDATE submissions
                   SET status = 'JudgeFailed',
                       failure_reason = :reason
                 WHERE id = :sub_id
                   AND status IN ('Pending', 'Judging')
            """),
            {
                "reason": payload.failure_reason,
                "sub_id": payload.submission_id,
            },
        )
    else:
        # Success path（Step 8 既有邏輯）：partial credit 算分 + 推 overall verdict
        tc_ids = [tc.testcase_id for tc in payload.per_testcase]
        weights_by_id = {
            tid: w
            for tid, w in db.query(TestCase.id, TestCase.score_weight)
                              .filter(TestCase.id.in_(tc_ids)).all()
        } if tc_ids else {}

        verdict = aggregate_verdict(payload.per_testcase)
        score = calc_score(payload.per_testcase, weights_by_id)

        result = db.execute(
            text("""
                UPDATE submissions
                   SET status = :verdict,
                       score = :score,
                       execution_time = :exec_ms,
                       memory_usage = :mem_mb,
                       judge_log = :log
                 WHERE id = :sub_id
                   AND status IN ('Pending', 'Judging')
            """),
            {
                "verdict": verdict.value,
                "score": score,
                "exec_ms": payload.exec_time_ms,
                "mem_mb": payload.memory_mb,
                "log": payload.judge_log,
                "sub_id": payload.submission_id,
            },
        )

    db.commit()

    if payload.verdict == "Success" and result.rowcount > 0:
        for tc in payload.per_testcase:
            tc_weight = weights_by_id.get(tc.testcase_id, 0)
            tc_score = tc_weight if tc.case_verdict == "AC" else 0
            
            try:
                js = JudgeStatus(tc.case_verdict)
            except ValueError:
                js = JudgeStatus.RE
                
            detail = SubmissionDetail(
                submission_id=payload.submission_id,
                testcase_id=tc.testcase_id,
                status=js,
                execution_time=tc.exec_time_ms,
                score=tc_score,
                runtime_info=tc.runtime_info,
            )
            db.add(detail)
        db.commit()

    if result.rowcount == 0:
        log.info(
            "callback no-op sub=%s verdict=%s (duplicate / unknown / already finalized)",
            payload.submission_id,
            payload.verdict,
        )

    return Response(status_code=status.HTTP_200_OK)
