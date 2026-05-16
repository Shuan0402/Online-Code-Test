import json
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api import deps
from app.models.submission import Submission
from app.models.problem import Problem
from app.schemas.submission import SubmissionCreate, SubmissionRead, JudgeTaskPayload
from app.services.queue_manager import queue_manager


router = APIRouter()

@router.post("/", response_model=SubmissionRead, status_code=status.HTTP_202_ACCEPTED)
def create_submission(
    payload: SubmissionCreate,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user),
    storage_service = Depends(deps.get_storage) 
):
    """
    1. 驗證題目是否存在，取得時限與記憶體限制
    2. 建立 Pending 狀態的 Submission 紀錄
    3. 程式碼上傳 MinIO 取得永久 URI
    4. 生成 pre-signed URL 並與限制條件打包
    5. 送入 Redis Queue (submissions:pending) 觸發 Worker 判題
    """
    problem = db.query(Problem).filter(Problem.id == payload.problem_id).first()
    if not problem:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"找不到指定的題目 (ID: {payload.problem_id})"
        )

    target_lang = payload.language.lower()

    db_submission = Submission(
        user_id=current_user.id,
        problem_id=payload.problem_id,
        exam_id=payload.exam_id,
        submission_type=payload.submission_type,
        language=target_lang,
        code_s3_url="PENDING_UPLOAD",
        status="Pending",
        score=0
    )
    db.add(db_submission)
    db.commit()
    db.refresh(db_submission)

    try:
        s3_uri = storage_service.upload_source(
            submission_id=db_submission.id,
            source_code=payload.source_code,
            language=target_lang
        )
        
        db_submission.code_s3_url = s3_uri
        db.commit()

        presigned_url = storage_service.sign_get_url(s3_uri)

    except Exception as storage_err:
        db.delete(db_submission)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"物件儲存服務異常，交卷失敗: {str(storage_err)}"
        )

    task_payload = JudgeTaskPayload(
        submission_id=db_submission.id,
        problem_id=db_submission.problem_id,
        language=db_submission.language,
        presigned_url=presigned_url,
        time_limit=problem.time_limit,
        memory_limit=problem.memory_limit
    )

    push_success = queue_manager.push_to_queue(
        queue_name=queue_manager.QUEUE_PENDING,
        data=task_payload.model_dump()
    )

    if not push_success:
        db_submission.status = "CE" 
        db_submission.judge_log = "系統發送判題佇列失敗，請聯絡系統管理員。"
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="評測佇列伺服器異常，請稍後再試。"
        )

    return db_submission