from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import Optional
from enum import Enum

class JudgeStatus(str, Enum):
    """
    定義評測結果的狀態。
    """
    PENDING = "Pending"
    JUDGING = "Judging"
    AC = "AC"
    WA = "WA"
    TLE = "TLE"
    MLE = "MLE"
    RE = "RE"
    CE = "CE"

class SubmissionBase(BaseModel):
    """
    定義 Submission 的基本欄位，Create 和 Read 都會用到。
    """
    language: str = Field(..., json_schema_extra={"example": "python"})
    code_s3_url: str = Field(..., description="程式碼存放路徑")

class SubmissionCreate(BaseModel):
    """
    定義 SubmissionCreate 的欄位，考生提交程式碼時使用。
    """
    problem_id: int
    language: str
    source_code: str 

class SubmissionRead(SubmissionBase):
    """
    定義 SubmissionRead 的欄位，回傳給前端使用。
    """
    id: str
    user_id: str
    problem_id: int
    status: JudgeStatus
    execution_time: Optional[int] = None # 毫秒
    memory_usage: Optional[int] = None  # MB
    judge_log: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)