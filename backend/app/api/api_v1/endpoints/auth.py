from typing import Annotated
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from jose import jwt, JWTError
import logging

from app.core.config import settings
from app.api import deps
from app.core.security import SecurityManager
from app.models.user import User
from app.schemas.token import Token, TokenRefreshInput, TokenRefreshResponse, ForgotPasswordInput, ResetPasswordInput
from app.schemas.email import EmailTaskPayload, EmailTaskType
from app.core.redis_client import redis_client
from app.services.queue_manager import queue_manager

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/login", response_model=Token)
def login(
    db: Annotated[Session, Depends(deps.get_db)],
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()]
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
    current_user: Annotated[User, Depends(deps.get_current_user)],
    token: Annotated[str, Depends(deps.oauth2_scheme)]
):
    """
    登出 API。將 Token 放入 Redis 黑名單。
    """
    redis_client.setex(f"blacklist:{token}", 86400, "true")
    
    return {"detail": "已成功登出"}

@router.post("/refresh", response_model=TokenRefreshResponse, tags=["🔒 認證相關"])
def refresh_token(
    payload: TokenRefreshInput,
    db: Annotated[Session, Depends(deps.get_db)]
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

    try:
        user_uuid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
    except (ValueError, TypeError):
        user_uuid = user_id

    user = db.query(User).filter(User.id == user_uuid).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="找不到對應的使用者。")

    redis_client.setex(f"blacklist:{payload.refresh_token}", 604800, "true")

    new_access_token = SecurityManager.create_access_token(subject=str(user.id))
    
    return TokenRefreshResponse(
        access_token=new_access_token,
        token_type="bearer"
    )

@router.post("/forgot-password")
def forgot_password(
    payload: ForgotPasswordInput,
    request: Request,
    db: Annotated[Session, Depends(deps.get_db)]
):
    """
    忘記密碼請求
    - User Enumeration Prevention (不論帳號是否存在，一律回傳 200 OK，防止駭客枚舉使用者)
    - 生成 15 分鐘短效 reset token，並在本地 Console/Log 中模擬發送郵件
    - 將發信任務打包成標準 JSON 灌入 Redis messages:email 佇列，交由獨立 Email Worker 發信
    """
    x_forwarded_for = request.headers.get("X-Forwarded-For")
    if x_forwarded_for:
        client_ip = x_forwarded_for.split(",")[0].strip()
    elif request.client:
        client_ip = request.client.host
    else:
        client_ip = "0.0.0.0"

    audit_extra = {
        "client_ip": client_ip,
        "requested_username": payload.username,
        "action": "password_reset_request"
    }

    logger.info(f"[Forgot Password] 收到忘記密碼請求 | 帳號: {payload.username} | IP: {client_ip}", extra=audit_extra)

    user = db.query(User).filter(User.username == payload.username).first()
    
    if not user or not user.is_active:
        logger.warning(f"[Forgot Password] 偵測到嘗試探測不存在或已停用的帳號: {payload.username}")
        return {"detail": "若此帳號存在於系統中，重設密碼的郵件已成功發送。"}

    reset_token = SecurityManager.create_password_reset_token(subject=str(user.id))
    reset_url = f"{settings.FRONTEND_HOST}/reset-password?token={reset_token}"

    target_email = user.username
    if "@" not in target_email:
        target_email = f"{target_email}@mock-test.com"

    email_payload = EmailTaskPayload(
        to_email=target_email,
        task_type=EmailTaskType.PASSWORD_RESET,
        context={
            "username": user.full_name or user.username,
            "reset_url": reset_url,
            "expire_minutes": 15
        }
    )

    push_success = queue_manager.push_to_queue(
        queue_name=queue_manager.QUEUE_EMAIL,
        data=email_payload.model_dump(mode="json")
    )

    if not push_success:
        audit_extra["action"] = "email_queue_push_failed"
        logger.critical(f"[Forgot Password] 嚴重故障：無法將郵件任務推入 Redis！[用戶: {user.username}]", extra=audit_extra)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="系統郵件調度伺服器繁忙，請稍後再試。"
        )
    
    audit_extra["action"] = "email_task_queued_successfully"
    logger.info(f"[Forgot Password] 郵件任務已成功進入非同步管線 [收件人: {user.username}]", extra=audit_extra)

    return {"detail": "若此帳號存在於系統中，重設密碼的郵件已成功發送。"}

@router.post("/reset-password")
def reset_password(
    payload: ResetPasswordInput,
    db: Annotated[Session, Depends(deps.get_db)]
):
    """
    透過 Token 實體重設密碼
    - 檢查 Token 是否已被使用（Redis 黑名單）
    - 解析並驗證 Token 效期與職責（type: reset）
    - 重設成功後，熔斷該 Token 並對新密碼進行雜湊加密
    """
    if redis_client.get(f"blacklist:{payload.token}"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="此重設密碼連結已失效或已被使用過，請重新申請。"
        )

    try:
        token_data = jwt.decode(
            payload.token, 
            settings.JWT_SECRET, 
            algorithms=[settings.ALGORITHM]
        )
        
        user_id: str = token_data.get("sub")
        token_type: str = token_data.get("type")
        
        if user_id is None or token_type != "reset":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="憑證類型錯誤，無法用於重設密碼。"
            )

    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="重設密碼連結已過期或毀損，請重新申請。"
        )

    try:
        user_uuid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
    except (ValueError, TypeError):
        user_uuid = user_id

    user = db.query(User).filter(User.id == user_uuid).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="該帳號不存在或已被停用。"
        )

    user.password_hash = SecurityManager.hash_password(payload.new_password)
    db.commit()

    redis_client.setex(f"blacklist:{payload.token}", 900, "true")

    logger.info(f"[Reset Password] 使用者 {user.username} 已成功變更密碼。")
    
    return {"detail": "密碼已變更成功，請使用新密碼重新登入。"}