import psutil 
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.api import deps
from app.models.user import User, UserRole
from app.models.exam import Exam, ExamStatus
from app.schemas.admin import DashboardSummaryResponse
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
    if current_user.role != UserRole.Admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="權限不足：此端點僅限系統管理員存取。"
        )

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