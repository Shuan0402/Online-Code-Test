from typing import Generator
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
# from app.models.user import User # 未來認證會用到

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