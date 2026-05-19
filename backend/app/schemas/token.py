from pydantic import BaseModel, EmailStr
from typing import Optional
from app.models.enums import UserRole

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    refresh_token: str
    role: str
    user_id: str

class TokenPayload(BaseModel):
    """
    解析 Token 後，sub 欄位通常存儲 User ID (UUID)，這比 username 更穩定。
    """
    sub: Optional[str] = None
    role: Optional[UserRole] = None

class TokenRefreshInput(BaseModel):
    """
    前端拿來交換新 Access Token 的 Refresh Token
    """
    refresh_token: str

class TokenRefreshResponse(BaseModel):
    """
    後端核發的新 Token 回傳格式
    """
    access_token: str
    token_type: str = "bearer"

class ForgotPasswordInput(BaseModel):
    """
    忘記密碼請求：前端傳入使用者的帳號（Email）
    """
    username: str