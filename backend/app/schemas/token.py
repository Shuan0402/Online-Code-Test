from pydantic import BaseModel
from typing import Optional
from app.models.enums import UserRole

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TokenPayload(BaseModel):
    """
    解析 Token 後，sub 欄位通常存儲 User ID (UUID)，這比 username 更穩定。
    """
    sub: Optional[str] = None
    role: Optional[UserRole] = None