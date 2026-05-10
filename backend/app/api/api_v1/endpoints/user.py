from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.api import deps
from app.models.user import User
from app.schemas.user import UserCreate, UserRead

router = APIRouter()

@router.post("/", response_model=UserRead)
def create_user(obj_in: UserCreate, db: Session = Depends(deps.get_db)):
    user = db.query(User).filter(User.username == obj_in.username).first()
    if user:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    new_user = User(
        username=obj_in.username,
        full_name=obj_in.full_name,
        password_hash=f"hashed_{obj_in.password}", # 暫時先這樣，之後換成真 Hash
        role=obj_in.role
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.get("/", response_model=List[UserRead])
def read_users(db: Session = Depends(deps.get_db)):
    return db.query(User).all()