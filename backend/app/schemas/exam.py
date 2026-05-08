from pydantic import BaseModel, Field, ConfigDict, model_validator
from datetime import datetime
from typing import Optional, List
from uuid import UUID
from app.models.enums import ExamStatus, DifficultyLevel

# Exam Problem
class ExamProblemBase(BaseModel):
    """
    考試中的單一題目資訊 (包含佔分比例)。
    """
    problem_id: int = Field(..., description="題目 ID")
    sequence: int = Field(..., description="題號順序")
    points: int = Field(default=100, description="本題佔分")

class ExamProblemRead(ExamProblemBase):
    """
    讀取時，附帶題目的基本資訊。
    （注意：這裡不要暴露解答或完整測資）
    """
    title: str = Field(..., description="題目名稱")
    difficulty: DifficultyLevel
    
    model_config = ConfigDict(from_attributes=True)

# Exam
class ExamBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=100, json_schema_extra={"example": "2026 後端實作測驗"})
    duration_minutes: int = Field(default=120, gt=0, description="考試時長 (分鐘)")
    
    easy_count: int = Field(default=0, ge=0)
    medium_count: int = Field(default=0, ge=0)
    hard_count: int = Field(default=0, ge=0)

    @model_validator(mode='after')
    def check_total_questions(self) -> 'ExamBase':
        """確保整份考卷至少有一題"""
        if self.easy_count + self.medium_count + self.hard_count == 0:
            raise ValueError('考試至少需要包含一題 (easy, medium, hard 總和不能為 0)')
        return self

class ExamCreate(ExamBase):
    """
    建立考試時，必須指定指派給哪位考生。
    主考官 (creator_id) 會從 JWT Token 中自動解析，不需要前端傳入。
    """
    candidate_id: UUID = Field(..., description="被指派的考生 ID")

class ExamUpdate(BaseModel):
    """
    更新考試狀態（例如：發布、歸檔，或考生開始作答）。
    """
    title: Optional[str] = None
    duration_minutes: Optional[int] = Field(None, gt=0)
    status: Optional[ExamStatus] = None
    
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None

class ExamRead(ExamBase):
    """
    回傳完整的考試資訊給管理員或考生。
    """
    id: UUID
    creator_id: UUID
    candidate_id: UUID
    status: ExamStatus
    score: int = Field(default=0, description="考卷最終得分")
    
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    created_at: datetime

    exam_problems: List[ExamProblemRead] = []

    model_config = ConfigDict(from_attributes=True)