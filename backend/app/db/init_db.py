# backend/app/db/init_db.py
import logging
import sys
import os
from sqlalchemy.orm import Session
from app.db.session import engine

sys.path.append(os.getcwd())

from app.models.user import User, UserRole  
from app.db.base import Base
from app.core.security import SecurityManager  

logger = logging.getLogger("app")

FIXED_TEST_USERS = [
    {
        "username": "admin@nthu.edu.tw",
        "full_name": "管理員",
        "password": "password123",
        "role": UserRole.Admin,
    },
    {
        "username": "candidate@nthu.edu.tw",
        "full_name": "測試考生",
        "password": "password123",
        "role": UserRole.Candidate,
    },
        {
        "username": "interviewer@nthu.edu.tw",
        "full_name": "面試主管",
        "password": "password123",
        "role": UserRole.Interviewer,
    },
    {
        "username": "questioner@nthu.edu.tw",
        "full_name": "出題主管",
        "password": "password123",
        "role": UserRole.Questioner,
    }
]

def init_development_data(db: Session) -> None:
    Base.metadata.create_all(bind=engine)
    
    logger.info("正在檢查並灌入固定開發測試用帳密...")
    
    for user_info in FIXED_TEST_USERS:
        existing_user = db.query(User).filter(User.username == user_info["username"]).first()
        
        if not existing_user:
            hashed = SecurityManager.hash_password(user_info["password"])
            db_user = User(
                username=user_info["username"],
                full_name=user_info["full_name"],
                password_hash=hashed,  
                role=user_info["role"],
                is_active=True
            )
            db.add(db_user)
            logger.info(f"【架構對齊】成功灌入固定加密帳號: {user_info['username']}")
        else:
            logger.info(f"帳號已存在: {user_info['username']}")
            
    db.commit()

if __name__ == "__main__":
    from app.db.session import SessionLocal
    logging.basicConfig(level=logging.INFO)
    db = SessionLocal()
    try:
        init_development_data(db)
    finally:
        db.close()