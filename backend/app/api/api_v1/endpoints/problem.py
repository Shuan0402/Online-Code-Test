from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID

from app.api import deps
from app.models.user import User
from app.models.problem import Problem
from app.models.testcase import TestCase
from app.models.enums import UserRole
from app.schemas.problem import ProblemCreate, ProblemUpdate, ProblemRead, ProblemShortRead

router = APIRouter()

# 只有 Admin 或 Questioner 可以新增、修改、刪除題目
get_staff_user = deps.RoleChecker(["Admin", "Questioner"])

@router.get("/", response_model=List[ProblemShortRead])
def read_problems(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100
):
    """
    獲取題目清單。
    """
    problems = db.query(Problem.id, Problem.title, Problem.difficulty).offset(skip).limit(limit).all()
    return problems

