from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import Optional
from uuid import UUID
from app.models.enums import UserRole


class UserBase(BaseModel):
    """
    使用者基本資訊。
    """
    username: str = Field(..., min_length=3, max_length=50, json_schema_extra={"example": "tony_stark"})
    full_name: Optional[str] = Field(None, max_length=100, json_schema_extra={"example": "Tony Stark"})
    role: UserRole = Field(default=UserRole.Candidate)

class UserCreate(UserBase):
    """
    註冊時使用的 Schema，包含密碼明文。
    """
    password: str = Field(..., min_length=8, json_schema_extra={"example": "strong_password123"})

class UserUpdate(BaseModel):
    """
    更新使用者資訊（例如修改姓名或角色）。
    """
    full_name: Optional[str] = None
    role: Optional[UserRole] = None

class UserRead(UserBase):
    """
    回傳給前端的資料，將 id 改為 UUID 型別以對應 GUID 工具。
    """
    id: UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class UserLogin(BaseModel):
    """
    登入請求。
    """
    username: str
    password: str

class Token(BaseModel):
    """
    登入成功後回傳的 JWT Token。
    """
    access_token: str
    token_type: str = "bearer"

class TokenData(BaseModel):
    """
    解析 Token 後暫存在 Request 中的資訊。
    """
    username: Optional[str] = None
    role: Optional[UserRole] = None