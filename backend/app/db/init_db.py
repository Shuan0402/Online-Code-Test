# backend/app/db/init_db.py
import json
import logging
import sys
import os
from pathlib import Path
from sqlalchemy.orm import Session

sys.path.append(os.getcwd())

from app.models.user import User, UserRole  
from app.models.problem import Problem
from app.models.testcase import TestCase
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

def seed_problems(db: Session) -> None:
    """動態綁定外鍵並初始化題庫與測資 (保持冪等性)"""
    problem_seed_path = SEED_DIR / "problems.json"
    if not problem_seed_path.exists():
        logger.warning(f"【系統初始化】找不到題目種子檔案: {problem_seed_path}，跳過題庫初始化。")
        return

    questioner = db.query(User).filter(User.role == UserRole.Questioner).first()
    if not questioner:
        logger.error("資料庫中找不到出題主管角色，無法建立題目外鍵，終止題庫注入。")
        return
    
    logger.info(f"正在讀取 seeds/problems.json。預設建立者綁定為: {questioner.username}")
    with open(problem_seed_path, "r", encoding="utf-8") as f:
        fixed_problems = json.load(f)

    for prob_info in fixed_problems:
        existing_prob = db.query(Problem).filter(Problem.title == prob_info["title"]).first()
        
        if not existing_prob:
            db_problem = Problem(
                creator_id=questioner.id,
                title=prob_info["title"],
                description=prob_info["description"],
                difficulty=prob_info["difficulty"],
                time_limit_ms=prob_info["time_limit_ms"],
                memory_limit_mb=prob_info["memory_limit_mb"],
                is_deleted=False
            )
            db.add(db_problem)
            db.flush()

            for tc_info in prob_info["testcases"]:
                db_testcase = TestCase(
                    problem_id=db_problem.id,
                    input_data=tc_info["input_data"],
                    expected_output=tc_info["expected_output"],
                    is_sample=tc_info["is_sample"],
                    score_weight=tc_info["score_weight"]
                )
                db.add(db_testcase)
            
            logger.info(f"成功建立題目與 50/50 測資 -> [{prob_info['difficulty']}] {prob_info['title']}")
        else:
            logger.info(f"題目已存在，跳過建立: {prob_info['title']}")
            
    db.commit()

def init_development_data(db: Session, bind_engine=None) -> None:
    """資料庫初始化主要生命週期控制"""
    logger.info("正在建立資料庫實體資料表 (若不存在)...")
    if bind_engine is None:
        bind_engine = engine
    Base.metadata.create_all(bind=bind_engine)
    
    seed_users(db)
    seed_problems(db)


if __name__ == "__main__":
    from app.db.session import SessionLocal
    logging.basicConfig(level=logging.INFO)
    db = SessionLocal()
    try:
        init_development_data(db)
    finally:
        db.close()