from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID

from app.api import deps
from app.models.user import User
from app.schemas.user import UserCreate, UserRead
from app.core.security import SecurityManager

router = APIRouter()

@router.post("/", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(
    obj_in: UserCreate, 
    db: Session = Depends(deps.get_db), 
    current_user: User = Depends(deps.get_interviewer_user)
):
    user = db.query(User).filter(User.username == obj_in.username).first()
    if user:
        raise HTTPException(status_code=400, detail="該帳號名稱已存在")
    
    new_user = User(
        username=obj_in.username,
        full_name=obj_in.full_name,
        password_hash=SecurityManager.hash_password(obj_in.password),
        role=obj_in.role
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.get("/", response_model=List[UserRead])
def read_users(db: Session = Depends(deps.get_db), current_user: User = Depends(deps.get_interviewer_user)):
    return db.query(User).all()

@router.get("/me", response_model=UserRead)
def get_current_user_info(current_user: User = Depends(deps.get_current_user)):
    """
    獲取當前登入使用者的詳細資訊。
    """
    return current_user

@router.get("/{user_id}", response_model=UserRead)
def read_user_by_id(
    user_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_interviewer_user)
):
    """
    獲取特定使用者細節。
    - 僅限 Admin 或 Interviewer 操作。
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="找不到該使用者"
        )
    return user