from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.api import deps
from app.core.security import SecurityManager
from app.models.user import User
from app.schemas.token import Token
from app.core.redis_client import redis_client

router = APIRouter()

@router.post("/login", response_model=Token)
def login(
    db: Session = Depends(deps.get_db),
    form_data: OAuth2PasswordRequestForm = Depends()
):
    user = db.query(User).filter(User.username == form_data.username).first()
    
    if not user or not SecurityManager.verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="帳號或密碼錯誤",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = SecurityManager.create_access_token(subject=str(user.id))
    
    return Token(access_token=access_token, token_type="bearer", role=user.role.value, user_id=str(user.id))

@router.post("/logout")
def logout(
    current_user: User = Depends(deps.get_current_user),
    token: str = Depends(deps.oauth2_scheme)
):
    """
    登出 API。將 Token 放入 Redis 黑名單。
    """
    redis_client.setex(f"blacklist:{token}", 86400, "true")
    
    return {"detail": "已成功登出"}