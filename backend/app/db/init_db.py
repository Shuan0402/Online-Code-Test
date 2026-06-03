# backend/app/db/init_db.py
import json
import logging
import sys
import os
from pathlib import Path
from sqlalchemy.orm import Session

sys.path.append(os.getcwd())

from app.models.user import User, UserRole  
from app.db.base import Base
from app.db.session import engine
from app.core.security import SecurityManager  

logger = logging.getLogger("app")

SEED_DIR = Path(__file__).parent / "seeds"

def seed_users(db: Session) -> None:
    """初始化使用者帳號資料 (保持冪等性)"""
    user_seed_path = SEED_DIR / "users.json"
    
    if not user_seed_path.exists():
        logger.warning(f"【系統初始化】找不到使用者種子檔案: {user_seed_path}，跳過帳號初始化。")
        return

    logger.info("正在讀取 seeds/users.json 載入 Demo 演示用固定帳密...")
    with open(user_seed_path, "r", encoding="utf-8") as f:
        fixed_users = json.load(f)

    for user_info in fixed_users:
        existing_user = db.query(User).filter(User.username == user_info["username"]).first()
        
        if not existing_user:
            try:
                role_enum = UserRole(user_info["role"])
            except ValueError:
                role_enum = UserRole[user_info["role"]]

            hashed = SecurityManager.hash_password(user_info["password"])
            db_user = User(
                username=user_info["username"],
                full_name=user_info["full_name"],
                password_hash=hashed,  
                role=role_enum,
                is_active=True
            )
            db.add(db_user)
            logger.info(f"成功建立 Demo 專用帳號 -> {user_info['username']} ({user_info['full_name']})")
        else:
            logger.info(f"帳號已存在，跳過建立: {user_info['username']}")
            
    db.commit()

def init_development_data(db: Session) -> None:
    """資料庫初始化主要生命週期控制"""
    logger.info("正在建立資料庫實體資料表 (若不存在)...")
    Base.metadata.create_all(bind=engine)
    
    seed_users(db)

if __name__ == "__main__":
    from app.db.session import SessionLocal
    logging.basicConfig(level=logging.INFO)
    db = SessionLocal()
    try:
        init_development_data(db)
    finally:
        db.close()