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
from app.models.testcase import TestCase
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
    # Score 用 partial credit：撈 per_testcase 對應的 score_weight
    tc_ids = [tc.testcase_id for tc in payload.per_testcase]
    weights_by_id = {
        tid: w
        for tid, w in db.query(TestCase.id, TestCase.score_weight)
                          .filter(TestCase.id.in_(tc_ids)).all()
    } if tc_ids else {}

    verdict = aggregate_verdict(payload.per_testcase)
    score = calc_score(payload.per_testcase, weights_by_id)

    # SQL guard：WHERE status IN ('Pending','Judging') 才 update
    # 重複 callback / submission 不存在 / 已 finalize 一律 rowcount=0 silent 200
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

    if result.rowcount == 0:
        log.info(
            "callback no-op sub=%s (duplicate / unknown / already finalized)",
            payload.submission_id,
        )

    return Response(status_code=status.HTTP_200_OK)
