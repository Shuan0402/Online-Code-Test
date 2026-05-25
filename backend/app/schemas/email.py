from pydantic import BaseModel, EmailStr, Field
from enum import Enum

class EmailTaskType(str, Enum):
    PASSWORD_RESET = "PASSWORD_RESET"
    EXAM_INVITATION = "EXAM_INVITATION"

class EmailTaskPayload(BaseModel):
    """
    推入 Redis messages:email 佇列的 Fat Payload 規格
    """
    to_email: EmailStr = Field(..., description="收件人真實 Email (即 username)")
    task_type: EmailTaskType = Field(..., description="郵件類型，供 Worker 決定渲染哪套 Jinja2 模板")
    context: dict = Field(..., description="動態渲染模板所需的變數 context")