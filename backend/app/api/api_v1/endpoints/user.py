from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID

from app.api import deps
from app.models.user import User
from app.schemas.user import UserCreate, UserRead, UserUpdate, UserUpdatePassword
from app.core.security import SecurityManager
from app.models.enums import UserRole


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

@router.patch("/me", response_model=UserRead)
def update_current_user_profile(
    obj_in: UserUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user) # 已登入者皆可
):
    """
    修改個人資料。
    - 任何人皆可修改自己的 full_name。
    - 非 Admin 企圖變更自己的 role 回傳 403。
    """
    if obj_in.role is not None and current_user.role != UserRole.Admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="您沒有權限變更您的帳號角色"
        )

    if obj_in.full_name is not None:
        current_user.full_name = obj_in.full_name
        
    if obj_in.role is not None and current_user.role == UserRole.Admin:
        current_user.role = obj_in.role

    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return current_user

@router.patch("/{user_id}", response_model=UserRead)
def update_user_by_id(
    user_id: UUID,
    obj_in: UserUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_admin_user)
):
    """
    修改特定使用者（改姓名或變更權限角色）。
    - 僅限最高管理員 Admin 操作。
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="找不到該使用者"
        )
        
    if obj_in.full_name is not None:
        user.full_name = obj_in.full_name
        
    if obj_in.role is not None:
        user.role = obj_in.role

    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.put("/me/password", status_code=status.HTTP_200_OK)
def update_my_password(
    payload: UserUpdatePassword,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    一般使用者/考生自行修改密碼。
    - 必須驗證舊密碼（old_password）是否正確。
    """
    if not SecurityManager.verify_password(payload.old_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="舊密碼輸入錯誤"
        )
        
    current_user.password_hash = SecurityManager.hash_password(payload.new_password)
    db.add(current_user)
    db.commit()
    
    return {"detail": "密碼已成功修改"}