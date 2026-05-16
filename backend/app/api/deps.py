from typing import Generator, List
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from typing import Generator, Optional

from app.db.session import SessionLocal
from app.core.config import settings
from app.models.user import User
from app.schemas.token import TokenPayload
from app.core.redis_client import redis_client

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

def get_db() -> Generator:
    """
    資料庫 Session 依賴項。
    每個請求都會拿到一個獨立的 Session，並在請求結束後自動關閉。
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_current_user(
    db: Session = Depends(get_db), 
    token: str = Depends(oauth2_scheme)
) -> User:
    """
    權限驗證依賴項：驗證 JWT 有效性、檢查 Redis 黑名單、並回傳當前使用者。
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="無法驗證憑證",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if redis_client.get(f"blacklist:{token}"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="該憑證已登出，請重新登入",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET, algorithms=[settings.ALGORITHM]
        )
        token_data = TokenPayload(
            sub=payload.get("sub"), 
            role=payload.get("role")
        )
        if token_data.sub is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user: Optional[User] = db.query(User).filter(User.id == token_data.sub).first()

    if not user or not user.is_active:
        raise credentials_exception
    
    return user

class RoleChecker:
    def __init__(self, allowed_roles: List[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, current_user: User = Depends(get_current_user)):
        user_role_value = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
        
        if user_role_value not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"權限不足。需要: {self.allowed_roles}, 實際為: {user_role_value}"
            )
        return current_user

# 預定義常用的權限入口
get_admin_user = RoleChecker(["Admin"])
get_staff_user = RoleChecker(["Admin", "Questioner", "Interviewer"])
get_questioner_user = RoleChecker(["Admin", "Questioner"])
get_interviewer_user = RoleChecker(["Admin", "Interviewer"])