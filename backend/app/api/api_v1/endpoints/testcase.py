# backend/app/api/api_v1/endpoints/testcase.py

from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.orm import Session
from app.models.user import User

from app.api import deps
from app.models.enums import UserRole
from app.models.testcase import TestCase
from app.schemas.testcase import TestCaseRead, TestCaseUpdate


router = APIRouter()

@router.patch("/{id}", response_model=TestCaseRead)
def update_testcase(
    id: int,
    obj_in: TestCaseUpdate,
    db: Annotated[Session, Depends(deps.get_db)],
    current_user: Annotated[User, Depends(deps.get_staff_user)]
):
    """
    修改指定 ID 的測試資料
    - 僅限 Admin, Questioner
    """
    db_obj = db.query(TestCase).filter(TestCase.id == id).first()
    if not db_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="找不到該筆測試資料。")
    
    update_data = obj_in.model_dump(exclude_unset=True)
    for field in update_data:
        setattr(db_obj, field, update_data[field])
        
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    
    return db_obj

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_testcase(
    id: int,
    db: Annotated[Session, Depends(deps.get_db)],
    current_user: Annotated[User, Depends(deps.get_questioner_user)]
):
    """
    刪除指定 ID 的測試資料
    - 僅限 Admin, Questioner (Staff)
    """
    db_obj = db.query(TestCase).filter(TestCase.id == id).first()
    if not db_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="找不到該筆測試資料。")
    
    db.delete(db_obj)
    db.commit()
    
    return Response(status_code=status.HTTP_204_NO_CONTENT)