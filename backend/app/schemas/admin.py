from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict
from app.models.enums import JudgeStatus

class SystemHardwareMetrics(BaseModel):
    """
    伺服器實體硬體負載指標
    """
    cpu_usage_percent: float
    memory_usage_percent: float

class DashboardSummaryResponse(BaseModel):
    """
    管理員儀表板全域統計數據回傳格式
    """
    active_candidates_count: int
    system_hardware: SystemHardwareMetrics
    pending_tasks_count: int

class AnomalySubmissionItem(BaseModel):
    """
    單條異常提交完整審計資料
    """
    exam_name: str
    exam_id: str
    problem_name: str
    problem_id: int
    submitted_at: datetime
    username: str
    candidate_name: str
    verdict: JudgeStatus
    client_ip: Optional[str] = None
    error_detail: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class AnomalyLogResponse(BaseModel):
    """
    異常流水燈分頁回傳格式
    """
    items: List[AnomalySubmissionItem]
    total: int
    page: int
    size: int