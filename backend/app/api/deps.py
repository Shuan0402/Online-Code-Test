import os
import uuid
from functools import lru_cache
from typing import Generator, List, Annotated
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from typing import Generator, Optional

from app.db.session import SessionLocal
from app.core.config import settings
from app.models.user import User
from app.schemas.token import TokenPayload
from app.core.redis_client import redis_client
from app.services.storage import StorageService, build_storage_from_env
from app.models.enums import UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


@lru_cache(maxsize=1)
def get_storage() -> StorageService:
    """Cached storage client. Tests should `app.dependency_overrides[get_storage] = ...`."""
    return build_storage_from_env()


def verify_worker_secret(x_worker_secret: Optional[str] = Header(default=None)):
    """Worker → backend callback 認證。

    合約 3：header X-Worker-Secret 必須等於 backend env WORKER_SECRET。
    missing / mismatch 一律 401（不分辨、避免 timing 洩漏訊息）。
    """
    expected = os.environ.get("WORKER_SECRET")
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="server misconfigured: WORKER_SECRET unset",
        )
    if not x_worker_secret or x_worker_secret != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid worker secret",
        )

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
    db: Annotated[Session, Depends(get_db)], 
    token: Annotated[str, Depends(oauth2_scheme)]
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

    try:
        user_uuid = uuid.UUID(token_data.sub)
    except (ValueError, TypeError):
        user_uuid = token_data.sub

    user: Optional[User] = db.query(User).filter(User.id == user_uuid).first()

    if not user or not user.is_active:
        raise credentials_exception
    
    return user

class RoleChecker:
    def __init__(self, allowed_roles: List[str]):
        self.allowed_roles = set(allowed_roles) | {UserRole.Admin}

    def __call__(self, current_user: Annotated[User, Depends(get_current_user)]):
        if current_user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="您的帳號角色權限不足，拒絕存取此端點"
            )
        return current_user

# 預定義常用的權限入口
get_admin_user       = RoleChecker([UserRole.Admin])
get_staff_user       = RoleChecker([UserRole.Questioner, UserRole.Interviewer]) # 👈 不用再手動寫 Admin 了！
get_questioner_user  = RoleChecker([UserRole.Questioner])
get_interviewer_user = RoleChecker([UserRole.Interviewer])