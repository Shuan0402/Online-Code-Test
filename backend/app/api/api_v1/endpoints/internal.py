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

from typing import Annotated
from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import text, update
from sqlalchemy.orm import Session

from app.api import deps
from app.api.deps import verify_worker_secret
from app.models.submission import Submission, SubmissionDetail
from app.models.testcase import TestCase
from app.models.enums import JudgeStatus
from app.schemas.submission import JudgeCallbackPayload
from app.services.exam import exam_service
from app.services.judging import aggregate_verdict, calc_score


log = logging.getLogger(__name__)

router = APIRouter()


def _build_weights_by_id(db: Session, tc_ids: list) -> dict:
    """Fetch testcase score weights from DB, returning a {id: weight} dict."""
    if not tc_ids:
        return {}
    return dict(
        db.query(TestCase.id, TestCase.score_weight)
          .filter(TestCase.id.in_(tc_ids)).all()
    )


def _insert_submission_details(
    db: Session,
    payload: "JudgeCallbackPayload",
    weights_by_id: dict,
) -> None:
    """Persist per-testcase SubmissionDetail rows after a successful judgment."""
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


def _refresh_exam_score(db: Session, submission_id) -> None:
    """After judging, refresh the total score of the related exam."""
    sub = db.query(Submission).filter(Submission.id == submission_id).first()
    if sub and sub.exam_id and sub.submission_type == "OFFICIAL":
        try:
            exam_service.refresh_total_score(db, str(sub.exam_id))
        except Exception as e:
            log.warning("refresh_total_score after callback failed: %s", e)


@router.post(
    "/judge-callback",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(verify_worker_secret)],
)
def judge_callback(
    payload: JudgeCallbackPayload,
    db: Annotated[Session, Depends(deps.get_db)],
):
    # Step 9：根據 verdict 分兩條路徑、共用 `WHERE status IN ('Pending','Judging')` guard。
    if payload.verdict == "JudgeFailed":
        result = db.execute(
            update(Submission)
            .where(Submission.id == payload.submission_id)
            .where(Submission.status.in_([JudgeStatus.Pending, JudgeStatus.Judging]))
            .values(
                status=JudgeStatus.JudgeFailed,
                failure_reason=payload.failure_reason,
            )
        )
        weights_by_id = {}
    else:
        # Success path（Step 8 既有邏輯）：partial credit 算分 + 推 overall verdict
        tc_ids = [tc.testcase_id for tc in payload.per_testcase]
        weights_by_id = _build_weights_by_id(db, tc_ids)

        verdict = aggregate_verdict(payload.per_testcase)
        score = calc_score(payload.per_testcase, weights_by_id)

        result = db.execute(
            update(Submission)
            .where(Submission.id == payload.submission_id)
            .where(Submission.status.in_([JudgeStatus.Pending, JudgeStatus.Judging]))
            .values(
                status=verdict,
                score=score,
                execution_time=payload.exec_time_ms,
                memory_usage=payload.memory_mb,
                judge_log=payload.judge_log,
            )
        )

    db.commit()

    if payload.verdict == "Success" and result.rowcount > 0:
        _insert_submission_details(db, payload, weights_by_id)
        _refresh_exam_score(db, payload.submission_id)

    if result.rowcount == 0:
        log.info(
            "callback no-op sub=%s verdict=%s (duplicate / unknown / already finalized)",
            payload.submission_id,
            payload.verdict,
        )

    return Response(status_code=status.HTTP_200_OK)
