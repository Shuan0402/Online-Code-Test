from pydantic import BaseModel

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