from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import Optional, List
from uuid import UUID
from app.models.enums import DifficultyLevel # 匯入我們定義好的 Enum

# TestCase Schemas
class TestCaseBase(BaseModel):
    input_data: str = Field(..., json_schema_extra={"example": "1 2"})
    expected_output: str = Field(..., json_schema_extra={"example": "3"})
    is_sample: bool = Field(default=False, description="是否為範例測資")
    score_weight: int = Field(default=10, gt=0, description="此測資的佔分比例")

class TestCaseCreate(TestCaseBase):
    pass

class TestCaseRead(TestCaseBase):
    id: int
    
    model_config = ConfigDict(from_attributes=True)

# Problem Schemas
class ProblemBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=100, json_schema_extra={"example": "A + B Problem"})
    description: str = Field(..., json_schema_extra={"example": "請計算兩數之和"})
    difficulty: DifficultyLevel = Field(default=DifficultyLevel.Easy)
    time_limit: int = Field(default=1000, gt=0, description="單位為 ms")
    memory_limit: int = Field(default=256, gt=0, description="單位為 MB")

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
    time_limit: Optional[int] = Field(None, gt=0)
    memory_limit: Optional[int] = Field(None, gt=0)

class ProblemRead(ProblemBase):
    """
    讀取時包含資料庫自動產生的資訊，以及建立者資訊。
    """
    id: int
    creator_id: UUID
    created_at: datetime
    
    test_cases: List[TestCaseRead] = []

    model_config = ConfigDict(from_attributes=True)