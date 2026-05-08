from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import Optional
from app.models.enums import JudgeStatus

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
    回傳給前端。
    """
    id: UUID
    user_id: UUID
    problem_id: int
    exam_id: Optional[UUID] = None
    
    status: JudgeStatus
    code_s3_url: str
    
    execution_time: Optional[int] = None
    memory_usage: Optional[int] = None
    judge_log: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)