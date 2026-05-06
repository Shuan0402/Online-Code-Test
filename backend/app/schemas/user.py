from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from enum import Enum
from typing import Optional


class UserRole(str, Enum):
    """
    定義使用者的角色。
    """
    ADMIN = "Admin"
    CANDIDATE = "Candidate"

class UserBase(BaseModel):
    """
    定義使用者的基本欄位，Create 和 Read 都會用到。
    """
    username: str = Field(..., min_length=3, max_length=50)
    role: UserRole = Field(default=UserRole.CANDIDATE)

class UserCreate(UserBase):
    """
    建立使用者時使用的 Schema，需要密碼明文。
    """
    password: str = Field(..., min_length=8)

class UserRead(UserBase):
    """
    讀取使用者時回傳的 Schema，不包含密碼，包含 ID 與時間。
    """
    id: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)