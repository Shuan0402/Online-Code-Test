# backend/app/api/api_v1/endpoints/testcase.py

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api import deps
from app.models.enums import UserRole
from app.models.testcase import TestCase
from app.schemas.testcase import TestCaseRead, TestCaseUpdate

router = APIRouter()

@router.patch("/{id}", response_model=TestCaseRead)
def update_testcase(
    id: int,
    obj_in: TestCaseUpdate,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_staff_user)
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