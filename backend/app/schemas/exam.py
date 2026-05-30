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

class ExamProblemCreate(BaseModel):
    """
    面試官手動指派題目至考卷時的 Request Body。
    - 題號順序 (sequence) 會由後端自動推算，因此前端不需要、也不應該傳入。
    """
    problem_id: int = Field(..., description="欲添加的題目 ID")
    random_difficulty: Optional[DifficultyLevel] = Field(None, description="欲隨機抽取的難度（單題隨機模式填寫）")
    points: int = Field(default=100, description="本題在這張考卷中的配分")

    @model_validator(mode='after')
    def validate_modes(self) -> 'ExamProblemCreate':
        if self.problem_id is None and self.random_difficulty is None:
            raise ValueError('problem_id 與 random_difficulty 不能同時為空')
        return self

# Exam
class ExamBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=100, json_schema_extra={"example": "2026 後端實作測驗"})
    duration_minutes: int = Field(default=120, gt=0, description="考試時長 (分鐘)")
    
    easy_count: int = Field(default=0, ge=0)
    medium_count: int = Field(default=0, ge=0)
    hard_count: int = Field(default=0, ge=0)

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

class CandidateExamListRead(BaseModel):
    """
    考生看自己的考試清單時，每場考試的基本資訊。
    - 封鎖 exam_problems，防止還沒開始考就被偷看題目。
    - 只給最核心的狀態與時間中繼資料。
    """
    id: UUID
    title: str
    status: ExamStatus
    duration_minutes: int
    score: Optional[int] = Field(None, description="未結束前為 None，結束且公布後才秀出")
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    created_at: datetime
    # 對應 spec：candidate 只看「答對幾題」、不看分數。endpoint 在 candidate role
    # 分支計算 + 注入；interviewer/admin 視角這兩欄為 None（他們用 ExamResultRead）。
    total_problems: Optional[int] = Field(None, description="本場考試題目總數（給 candidate 列表用）")
    correct_count: Optional[int] = Field(None, description="本場考試考生答對題數（任一筆 submission status=AC）")

    model_config = ConfigDict(from_attributes=True)


class CandidateExamDetailRead(CandidateExamListRead):
    """
    開始考試後，考生查看自己的考試詳情時，才會附帶題目清單與剩餘秒數。
    - 只有在正式進入「考試中」狀態，才將題目清單（exam_problems）回傳給前端。
    - 額外附加 remaining_seconds，由後端統一控時，前端直接拿去跑倒數計時。
    """
    exam_problems: List[ExamProblemRead] = []
    remaining_seconds: Optional[int] = Field(
        None, 
        description="距離考試強迫收卷剩餘的精準秒數。若尚未開始或已結束則為 None"
    )

    model_config = ConfigDict(from_attributes=True)

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

class ExamProblemResultRead(BaseModel):
    """
    考試中單一題目的最新評測狀態。
    """
    problem_id: int = Field(..., description="題目 ID")
    title: str = Field(..., description="題目名稱")
    sequence: int = Field(..., description="題號順序")
    max_points: int = Field(..., description="本題總配分")
    candidate_score: int = Field(0, description="考生在該題取得的最高分數")
    submission_status: str = Field("Unsubmitted", description="最新一筆提交的評測狀態")

    model_config = ConfigDict(from_attributes=True)


class ExamResultRead(BaseModel):
    """
    整場考試的實時總得分。
    """
    id: UUID
    title: str
    status: ExamStatus
    total_exam_points: int = Field(0, description="整份考卷的總配分")
    total_candidate_score: int = Field(0, description="考生目前整場拿到點總分")
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    
    results: List[ExamProblemResultRead] = []

    model_config = ConfigDict(from_attributes=True)