from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api import deps
from app.models.exam import Exam
from app.models.enums import UserRole, ExamStatus
from app.schemas.exam import CandidateExamListRead

router = APIRouter()

@router.get("/", response_model=List[CandidateExamListRead])
def get_candidate_exams(
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user)
):
    """
    獲取考生自身被指派的考試清單
    - 考生只能看到指派給自己的考試。
    - 自動過濾掉尚未發布的草稿（Draft）考試。
    """
    if current_user.role != UserRole.Candidate:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="本端點專供受測考生調閱清單使用。"
        )

    exams = (
        db.query(Exam)
        .filter(
            Exam.candidate_id == current_user.id,
            Exam.status != ExamStatus.Draft
        )
        .order_by(Exam.created_at.desc())
        .all()
    )
    return exams