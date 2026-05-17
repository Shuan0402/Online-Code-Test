from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime

class TestCaseBase(BaseModel):
    input_data: str = Field(..., description="標準輸入資料 (Standard Input)")
    expected_output: str = Field(..., description="預期輸出資料 (Expected Output)")
    score_weight: int = Field(default=10, ge=0, description="本筆測資的分數權重")
    is_sample: bool = Field(default=False, description="是否展示給考生作為範例測資")

class TestCaseCreate(TestCaseBase):
    """
    建立新測資時前端傳入的 Request Body 規格
    """
    pass

class TestCaseRead(TestCaseBase):
    """
    出題者後台讀取測資時的回傳格式 (包含實體 ID 與建立時間)
    """
    id: int
    problem_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)