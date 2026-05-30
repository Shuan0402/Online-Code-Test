from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import Optional, List
from uuid import UUID
from app.models.enums import DifficultyLevel
# TestCase Schemas
class TestCaseBase(BaseModel):
    __test__ = False
    
    input_data: str = Field(..., json_schema_extra={"example": "1 2"})
    expected_output: str = Field(..., json_schema_extra={"example": "3"})
    is_sample: bool = Field(default=False, description="是否為範例測資")
    score_weight: int = Field(default=10, gt=0, description="此測資的佔分比例")

class TestCaseCreate(TestCaseBase):
    pass

class TestCaseRead(TestCaseBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class TestCaseUpdate(TestCaseBase):
    id: Optional[int] = Field(None, description="現有測資的 ID")

# Problem Schemas
class ProblemBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=100, json_schema_extra={"example": "A + B Problem"})
    description: str = Field(..., json_schema_extra={"example": "請計算兩數之和"})
    difficulty: DifficultyLevel = Field(default=DifficultyLevel.Easy)
    time_limit_ms: int = Field(default=1000, gt=0, description="單位為 ms")
    memory_limit_mb: int = Field(default=256, ge=6, description="單位為 MB")

class ProblemShortRead(BaseModel):
    """
    用於 GET /problems 列表展示。
    """
    id: int
    title: str
    difficulty: DifficultyLevel
    
    model_config = ConfigDict(from_attributes=True)

class ProblemCreate(ProblemBase):
    """
    建立題目時，允許同時帶入多組測資。
    """
    test_cases: List[TestCaseCreate] = Field(default=[], description="題目的測試案例列表")

class ProblemUpdate(BaseModel):
    """
    PATCH 時所有欄位皆可選。
    """
    title: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    difficulty: Optional[DifficultyLevel] = None
    time_limit_ms: Optional[int] = Field(None, gt=0)
    memory_limit_mb: Optional[int] = Field(None, ge=6)
    test_cases: Optional[List[TestCaseUpdate]] = Field(None, description="傳入則代表重設所有測資")

class ProblemRead(ProblemBase):
    """
    面試官/管理員視角：讀取時包含完全體資訊，包含所有內部測試案例。
    """
    id: int
    creator_id: UUID
    created_at: datetime
    
    test_cases: List[TestCaseRead] = []

    model_config = ConfigDict(from_attributes=True)

class ProblemCandidateRead(ProblemBase):
    """
    專供考生調閱的安全格式：只允許包含公開的範例測資。
    """
    id: int
    created_at: datetime
    test_cases: List[TestCaseRead] = []

    model_config = ConfigDict(from_attributes=True)