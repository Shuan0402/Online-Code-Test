from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from jose import jwt, JWTError

from app.core.config import settings
from app.api import deps
from app.core.security import SecurityManager
from app.models.user import User
from app.schemas.token import Token, TokenRefreshInput, TokenRefreshResponse
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
    refresh_token = SecurityManager.create_refresh_token(subject=str(user.id))
    
    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        role=user.role.value,
        user_id=str(user.id)
    )

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

@router.post("/refresh", response_model=TokenRefreshResponse, tags=["🔒 認證相關"])
def refresh_token(
    payload: TokenRefreshInput,
    db: Session = Depends(deps.get_db)
):
    """
    刷新 Access Token
    - 持有有效的 Refresh Token，換取全新 Access Token
    - 檢查 Redis 黑名單，並在交換成功後將舊的 Refresh Token 銷毀
    """
    if redis_client.get(f"blacklist:{payload.refresh_token}"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="該 Token 已失效或已被安全登出，請重新登入。"
        )

    try:
        token_data = jwt.decode(
            payload.refresh_token, 
            settings.JWT_SECRET, 
            algorithms=[settings.ALGORITHM]
        )
        
        user_id: str = token_data.get("sub")
        token_type: str = token_data.get("type")
        
        if user_id is None or token_type != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="無效的憑證類型。"
            )

    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh Token 已過期或損毀，請重新登入。"
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="找不到對應的使用者。")

    redis_client.setex(f"blacklist:{payload.refresh_token}", 604800, "true")

    new_access_token = SecurityManager.create_access_token(subject=str(user.id))
    
    return TokenRefreshResponse(
        access_token=new_access_token,
        token_type="bearer"
    )