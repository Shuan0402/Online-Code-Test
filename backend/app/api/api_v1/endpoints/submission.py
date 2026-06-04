import json
import logging
from uuid import UUID
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session, joinedload

from app.api import deps
from app.models.submission import Submission, SubmissionDetail
from app.models.problem import Problem
from app.models.exam import Exam, ExamProblem
from app.schemas.submission import SubmissionCreate, SubmissionRead, JudgeTaskPayload
from app.services.queue_manager import queue_manager
from app.models.enums import UserRole, ExamStatus, JudgeStatus
from app.models.testcase import TestCase


logger = logging.getLogger("app")

router = APIRouter()

@router.post("/", response_model=SubmissionRead, status_code=status.HTTP_202_ACCEPTED)
def create_submission(
    payload: SubmissionCreate,
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user),
    storage_service = Depends(deps.get_storage) 
):
    """
    建立程式碼提交並送入評測佇列。

    1. 驗證題目是否存在，取得時限與記憶體限制
    2. 建立 Pending 狀態的 Submission 紀錄
    3. 程式碼上傳 MinIO 取得永久 URI
    4. 生成 pre-signed URL 並與限制條件打包
    5. 送入 Redis Queue (submissions:pending) 觸發 Worker 判題
    """
    x_forwarded_for = request.headers.get("X-Forwarded-For")
    if x_forwarded_for:
        client_ip = x_forwarded_for.split(",")[0].strip()
    else:
        client_ip = request.client.host if request.client else "0.0.0.0"

    audit_extra = {
        "user_id": str(current_user.id),
        "user_role": current_user.role.value,
        "problem_id": payload.problem_id,
        "exam_id": str(payload.exam_id) if payload.exam_id else None,
        "client_ip": client_ip,
        "action": "create_submission_attempt"
    }

    logger.info(
        f"收到程式碼提交請求 | 用戶: {current_user.username} ({current_user.role.value}), 題目 ID: {payload.problem_id}, IP: {client_ip}",
        extra=audit_extra
    )

    if not payload.exam_id:
        logger.warning(f"提交失敗：未提供 exam_id [用戶: {current_user.id}]", extra=audit_extra)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="交卷失敗：必須提供有效的考試場次編號 (exam_id)。"
        )
    
    problem = db.query(Problem).filter(Problem.id == payload.problem_id).first()
    if not problem:
        logger.warning(f"提交失敗：題目 ID {payload.problem_id} 不存在", extra=audit_extra)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"找不到指定的題目 (ID: {payload.problem_id})"
        )
    
    exam = db.query(Exam).filter(Exam.id == payload.exam_id).first()
    if not exam:
        logger.warning(f"提交失敗：考試場次 ID {payload.exam_id} 不存在", extra=audit_extra)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="找不到指定的考試場次。")
    
    if current_user.role == UserRole.Candidate:
        if exam.candidate_id != current_user.id:
            audit_extra["action"] = "security_violation_wrong_candidate"
            logger.warning(
                f"越權警告：用戶 {current_user.id} 企圖提交不屬於自己的考場場次 {exam.id}！",
                extra=audit_extra
            )
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="越權存取：您並非本場考試的指定受測對象。")
        
        if exam.status != ExamStatus.Ongoing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail=f"交卷失敗：目前考場狀態為 {exam.status}，只有在 Ongoing (進行中) 狀態才允許提交程式碼。"
            )

    ep = db.query(ExamProblem).filter(
        ExamProblem.exam_id == payload.exam_id,
        ExamProblem.problem_id == payload.problem_id
    ).first()
    if not ep:
        logger.warning(f"提交失敗：題目 ID {payload.problem_id} 根本不屬於該考場", extra=audit_extra)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="提交失敗：本題目不屬於該場考試的範疇。")

    if payload.submission_type == "RUN_ONLY":
        logger.warning(
            f"拒絕提交：暫不支援 RUN_ONLY 類型 [用戶: {current_user.id}]",
            extra=audit_extra
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="交卷失敗：目前評測引擎僅支援 OFFICIAL 正式提交，不開放 RUN_ONLY 測試。"
        )

    target_lang = payload.language.lower()

    resolved_sub_type = payload.submission_type if payload.submission_type else "OFFICIAL"

    db_submission = Submission(
        user_id=current_user.id,
        problem_id=payload.problem_id,
        exam_id=payload.exam_id,
        submission_type=resolved_sub_type,
        language=target_lang,
        code_s3_url="PENDING_UPLOAD",
        status="Pending",
        score=0,
        client_ip=client_ip
    )
    db.add(db_submission)
    db.commit()
    db.refresh(db_submission)

    audit_extra["submission_id"] = str(db_submission.id)

    try:
        s3_uri = storage_service.upload_source(
            submission_id=db_submission.id,
            source_code=payload.source_code,
            language=target_lang
        )
        db_submission.code_s3_url = s3_uri
        db.commit()
        # for_worker=True：URL host 走 internal MinIO endpoint (minio:9000)、
        # 給 docker network 內的 worker 拉原始碼用，不可走 external (localhost:9000)
        presigned_url = storage_service.sign_get_url(s3_uri, for_worker=True)

        logger.info(f"原始碼成功上傳物體儲存 | S3_URI: {s3_uri}", extra=audit_extra)
    except Exception as storage_err:
        audit_extra["action"] = "storage_upload_failed_rollback"
        logger.exception(
            f"物件儲存異常：上傳程式碼失敗！正在自動撤銷（Rollback）資料庫紀錄 {db_submission.id}",
            extra=audit_extra
        )
        db.delete(db_submission)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"物件儲存服務異常，交卷失敗: {str(storage_err)}"
        )
    
    testcases = db.query(TestCase).filter(TestCase.problem_id == payload.problem_id).all()

    task_payload = JudgeTaskPayload(
        submission_id=db_submission.id,
        problem_id=db_submission.problem_id,
        language=db_submission.language,
        submission_type=db_submission.submission_type,
        presigned_url=presigned_url,
        time_limit_ms=problem.time_limit_ms,
        memory_limit_mb=problem.memory_limit_mb,
        testcases=[
            {
                "testcase_id": tc.id,
                "input_data": tc.input_data,
                "expected_output": tc.expected_output,
                "is_sample": tc.is_sample
            } for tc in testcases
        ]
    )

    push_success = queue_manager.push_to_queue(
        queue_name=queue_manager.QUEUE_PENDING,
        data=task_payload.model_dump(mode="json")
    )

    if not push_success:
        audit_extra["action"] = "queue_push_failed_se"
        logger.critical(
            f"嚴重基礎設施故障：無法將任務塞入 Redis 隊列！將 Submission {db_submission.id} 狀態標記為 SE",
            extra=audit_extra
        )
        db_submission.status = JudgeStatus.JudgeFailed
        db_submission.judge_log = "系統發送判題佇列失敗，請聯絡系統管理員。"
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="評測佇列伺服器異常，請稍後再試。"
        )

    audit_extra["action"] = "submission_accepted_pipeline_started"
    logger.info(
        f"程式碼交卷成功，已成功進入判題大動脈管線！ [SubmissionID: {db_submission.id}]",
        extra=audit_extra
    )
    return db_submission

@router.get("/latest", response_model=SubmissionRead)
def get_latest_submission(
    problem_id: int,
    exam_id: Optional[UUID] = None,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user),
    storage_service = Depends(deps.get_storage)
):
    """
    獲取特定題目最後一次提交 API
    - 專供考生進入題目時，自動還原上一次寫到一半的程式碼。
    - 僅鎖定當前登入使用者的最新一筆紀錄。
    """
    filters = [Submission.problem_id == problem_id, Submission.user_id == current_user.id]
    if exam_id:
        filters.append(Submission.exam_id == exam_id)

    submission = (
        db.query(Submission)
        .options(joinedload(Submission.details).joinedload(SubmissionDetail.test_case))
        .filter(*filters)
        .order_by(Submission.created_at.desc())
        .first()
    )
    
    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="您針對該題目尚未有任何提交紀錄"
        )
    
    logger.info(
        f"用戶 {current_user.username} 正在觸發編輯器程式碼自動還原 [SubmissionID: {submission.id}]",
        extra={"user_id": str(current_user.id), "problem_id": problem_id, "submission_id": str(submission.id), "action": "restore_code_latest"}
    )
    
    if submission.code_s3_url and submission.code_s3_url != "PENDING_UPLOAD":
        submission.presigned_url = storage_service.sign_get_url(submission.code_s3_url)
    
    if current_user.role == UserRole.Candidate:
        submission.failure_reason = None
        for detail in submission.details:
            if detail.test_case and not detail.test_case.is_sample:
                detail.runtime_info = None

    return submission

@router.get("/{submission_id}", response_model=SubmissionRead)
def get_submission_by_id(
    submission_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user),
    storage_service = Depends(deps.get_storage)
):
    """
    狀態查詢與明細 API
    
    - 考生（Candidate）只能查看「自己」的提交。
    - 管理員（Admin）、出題者（Questioner）、面試官（Interviewer）等非考生角色擁有全局調閱權限。
    """
    submission = (
        db.query(Submission)
        .options(joinedload(Submission.details).joinedload(SubmissionDetail.test_case))
        .filter(Submission.id == submission_id)
        .first()
    )
    
    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="找不到該筆繳交紀錄"
        )
    
    if submission.user_id != current_user.id and current_user.role == UserRole.Candidate:
        logger.warning(
            f"越權警告：考生 {current_user.id} 企圖調閱他人繳交紀錄 {submission_id} 被攔截！",
            extra={"user_id": str(current_user.id), "submission_id": str(submission_id), "action": "security_violation_view_detail"}
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="您沒有權限查看此繳交紀錄"
        )
    
    if submission.code_s3_url and submission.code_s3_url != "PENDING_UPLOAD":
        submission.presigned_url = storage_service.sign_get_url(submission.code_s3_url)
    
    if current_user.role == UserRole.Candidate:
        for detail in submission.details:
            if detail.test_case and not detail.test_case.is_sample:
                detail.runtime_info = None

    return submission

@router.get("/", response_model=List[SubmissionRead])
def get_submissions(
    problem_id: Optional[int] = None,
    exam_id: Optional[UUID] = None,
    user_id: Optional[UUID] = None,
    score_gte: Optional[int] = None,
    score_lte: Optional[int] = None,
    order_by: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user)
):
    """
    獲取提交紀錄列表 API

    - 考生（Candidate）只能看見自己的歷史紀錄。
    - 管理員與面試官可以跨全局調閱，並透過 `user_id` 或 `problem_id` 進行篩選。
    """
    query = db.query(Submission)

    if current_user.role == UserRole.Candidate:
        query = query.filter(Submission.user_id == current_user.id)
    else:
        if user_id:
            query = query.filter(Submission.user_id == user_id)

    if problem_id:
        query = query.filter(Submission.problem_id == problem_id)

    if exam_id:
        query = query.filter(Submission.exam_id == exam_id)

    if score_gte is not None:
        query = query.filter(Submission.score >= score_gte)

    if score_lte is not None:
        query = query.filter(Submission.score <= score_lte)

    if order_by:
        if order_by == "finished_at":
            query = query.order_by(Submission.created_at.asc())
        elif order_by == "-finished_at":
            query = query.order_by(Submission.created_at.desc())
        elif order_by == "score":
            query = query.order_by(Submission.score.asc())
        elif order_by == "-score":
            query = query.order_by(Submission.score.desc())
        else:
            query = query.order_by(Submission.created_at.desc())
    else:
        query = query.order_by(Submission.created_at.desc())

    logger.info(
        f"用戶 {current_user.username} 正在調閱提交紀錄列表 (Limit: {limit})",
        extra={"user_id": str(current_user.id), "user_role": current_user.role.value, "action": "view_submissions_list"}
    )

    return (
        query.offset(skip)
        .limit(limit)
        .all()
    )