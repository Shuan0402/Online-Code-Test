from datetime import datetime, timedelta, timezone
from typing import Any, Union
from jose import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from app.core.config import settings

ph = PasswordHasher()

class SecurityManager:
    @staticmethod
    def hash_password(password: str) -> str:
        return ph.hash(password)

    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        try:
            return ph.verify(hashed_password, plain_password)
        except VerifyMismatchError:
            return False
        
    @staticmethod
    def create_access_token(subject: Union[str, Any], expires_delta: timedelta = None) -> str:
        """
        產生 Access Token (短效期，帶有 access 標籤)
        """
        if expires_delta:
            expire = datetime.now(timezone.utc) + expires_delta
        else:
            expire = datetime.now(timezone.utc) + timedelta(
                minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
            )
        
        to_encode = {"exp": expire, "sub": str(subject), "type": "access"}
        
        return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.ALGORITHM)

    @staticmethod
    def create_refresh_token(subject: Union[str, Any]) -> str:
        """
        產生 Refresh Token (長效期這裡設定 7 天)
        """
        expire = datetime.now(timezone.utc) + timedelta(days=7)
        
        to_encode = {"exp": expire, "sub": str(subject), "type": "refresh"}
        
        return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.ALGORITHM)
    
    @staticmethod
    def create_password_reset_token(subject: str) -> str:
        """產生忘記密碼重設 Token (極短效期：15 分鐘，帶有 reset 標籤)"""
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
        to_encode = {"exp": expire, "sub": str(subject), "type": "reset"}
        return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.ALGORITHM)