from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import Optional
from enum import Enum

class DifficultyEnum(str, Enum):
    """
    定義題目的難度等級。
    """
    EASY = "Easy"
    MEDIUM = "Medium"
    HARD = "Hard"

class ProblemBase(BaseModel):
    """
    定義題目的基本欄位，Create 和 Read 都會用到。
    """
    title: str = Field(..., json_schema_extra={"example": "A + B Problem"})
    description: str = Field(..., json_schema_extra={"example": "請計算兩數之和"})
    difficulty: DifficultyEnum = Field(default=DifficultyEnum.EASY)
    time_limit: int = Field(default=1000, description="單位為 ms")
    memory_limit: int = Field(default=256, description="單位為 MB")

class ProblemCreate(ProblemBase):
    """
    建立時使用的 Schema (POST /problems)。
    """
    pass

class ProblemUpdate(BaseModel):
    """
    更新時使用的 Schema (PATCH /problems/{id})。
    """
    title: Optional[str] = None
    description: Optional[str] = None
    difficulty: Optional[DifficultyEnum] = None
    time_limit: Optional[int] = None
    memory_limit: Optional[int] = None

class ProblemRead(ProblemBase):
    """
    讀取時回傳的 Schema (GET /problems)。
    """
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)