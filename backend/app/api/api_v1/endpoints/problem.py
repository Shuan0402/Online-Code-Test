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


@router.get("/{problem_id}", response_model=ProblemRead)
def read_problem(
    problem_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    獲取特定題目詳細資訊。
    需登入後方可查看內容與限制條件。
    """
    problem = db.query(Problem).filter(Problem.id == problem_id).first()
    if not problem:
        raise HTTPException(status_code=404, detail="找不到該題目")
    
    if current_user.role == UserRole.Candidate:
        display_problem = ProblemRead.model_validate(problem)
        display_problem.test_cases = [tc for tc in display_problem.test_cases if tc.is_sample]
        return display_problem
    
    return problem


@router.post("/", response_model=ProblemRead, status_code=status.HTTP_201_CREATED)
def create_problem(
    *,
    db: Session = Depends(deps.get_db),
    problem_in: ProblemCreate,
    current_user: User = Depends(get_staff_user)
):
    """
    新增題目（含測試案例）。
    僅限 Admin 或 Questioner 執行。
    """
    db_problem = Problem(
        title=problem_in.title,
        description=problem_in.description,
        difficulty=problem_in.difficulty,
        time_limit=problem_in.time_limit,
        memory_limit=problem_in.memory_limit,
        creator_id=current_user.id
    )
    db.add(db_problem)
    db.flush()

    for tc in problem_in.test_cases:
        db_test_case = TestCase(
            **tc.model_dump(),
            problem_id=db_problem.id
        )
        db.add(db_test_case)
    
    db.commit()
    db.refresh(db_problem)
    return db_problem


@router.patch("/{problem_id}", response_model=ProblemRead)
def update_problem(
    *,
    db: Session = Depends(deps.get_db),
    problem_id: int,
    problem_in: ProblemUpdate,
    current_user: User = Depends(get_staff_user)
):
    """
    修改題目資訊。
    """
    db_problem = db.query(Problem).filter(Problem.id == problem_id).first()
    if not db_problem:
        raise HTTPException(status_code=404, detail="題目不存在")

    update_data = problem_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_problem, field, value)

    db.add(db_problem)
    db.commit()
    db.refresh(db_problem)
    return db_problem


@router.delete("/{problem_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_problem(
    *,
    db: Session = Depends(deps.get_db),
    problem_id: int,
    current_user: User = Depends(get_staff_user)
):
    """
    刪除題目。
    因 Model 已設定 cascade="all, delete-orphan"，對應的測資會一併刪除。
    """
    db_problem = db.query(Problem).filter(Problem.id == problem_id).first()
    if not db_problem:
        raise HTTPException(status_code=404, detail="題目不存在")
    
    db.delete(db_problem)
    db.commit()
    return None