from pydantic import BaseModel, Field, ConfigDict


class TestCaseBase(BaseModel):
    """
    定義測資的基本欄位，Create 和 Read 都會用到。
    """
    input_data: str
    expected_output: str
    is_sample: bool = False

class TestCaseCreate(TestCaseBase):
    """
    建立測資時使用的 Schema，需要指定所屬題目 ID。
    """
    problem_id: int

class TestCaseRead(TestCaseBase):
    """
    讀取測資時回傳的 Schema。
    """
    id: int
    problem_id: int

    model_config = ConfigDict(from_attributes=True)