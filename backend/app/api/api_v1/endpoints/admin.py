import psutil 
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.api import deps
from app.models.user import User, UserRole
from app.models.exam import Exam, ExamStatus
from app.models.problem import Problem
from app.models.submission import Submission, SubmissionDetail
from app.models.enums import JudgeStatus
from app.schemas.admin import DashboardSummaryResponse, AnomalyLogResponse
from app.core.redis_client import redis_client

router = APIRouter()

@router.get("/dashboard/summary", response_model=DashboardSummaryResponse)
def get_dashboard_summary(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_admin_user) 
):
    """
    獲取管理員儀表板全域統計數據
    - 限 Admin 角色存取
    - 實體監控：在線人數、Redis 佇列阻塞量、CPU/RAM 即時負載
    """
    active_candidates_count = db.query(Exam).filter(Exam.status == ExamStatus.Ongoing).count()

    cpu_load = psutil.cpu_percent(interval=None)
    memory_load = psutil.virtual_memory().percent

    pending_tasks = redis_client.llen("judge_queue") or 0

    return {
        "active_candidates_count": active_candidates_count,
        "system_hardware": {
            "cpu_usage_percent": cpu_load,
            "memory_usage_percent": memory_load
        },
        "pending_tasks_count": pending_tasks
    }

@router.get("/dashboard/anomalies", response_model=AnomalyLogResponse)
def get_dashboard_anomalies(
    page: int = 1,
    size: int = 10,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_admin_user)
):
    """
    獲取即時異常提交流水燈
    - 限 Admin 角色存取
    - 過濾出 RE/TLE/MLE 等耗損系統資源或引發崩潰的異常提交
    """
    # Step 9：JudgeFailed 也算異常（系統錯誤、需 admin 介入）
    anomaly_statuses = [
        JudgeStatus.RE,
        JudgeStatus.TLE,
        JudgeStatus.MLE,
        JudgeStatus.JudgeFailed,
    ]

    query = db.query(
        Exam.title.label("exam_name"),
        Exam.id.label("exam_id"),
        Problem.title.label("problem_name"),
        Problem.id.label("problem_id"),
        Submission.created_at.label("submitted_at"),
        User.username.label("username"),
        User.full_name.label("candidate_name"),
        Submission.status.label("verdict"),
        Submission.client_ip.label("client_ip"),
        Submission.judge_log.label("error_detail"),
        Submission.failure_reason.label("failure_reason"),
    ).join(User, Submission.user_id == User.id)\
     .join(Exam, Submission.exam_id == Exam.id)\
     .join(Problem, Submission.problem_id == Problem.id)\
     .filter(Submission.status.in_(anomaly_statuses))

    total = query.count()

    offset = (page - 1) * size
    results = query.order_by(Submission.created_at.desc()).offset(offset).limit(size).all()

    anomalies_list = []
    for r in results:
        anomalies_list.append({
            "exam_name": r.exam_name,
            "exam_id": str(r.exam_id),
            "problem_name": r.problem_name,
            "problem_id": r.problem_id,
            "submitted_at": r.submitted_at,
            "username": r.username,
            "candidate_name": r.candidate_name or "未填寫姓名",
            "verdict": r.verdict,
            "client_ip": r.client_ip or "Unknown IP",
            "error_detail": r.error_detail or "無詳細錯誤日誌",
            "failure_reason": r.failure_reason,
        })

    return {
        "items": anomalies_list,
        "total": total,
        "page": page,
        "size": size
    }