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
from app.schemas.testcase import TestCaseRead
from app.api.deps import get_questioner_user


router = APIRouter()

@router.get("/", response_model=List[ProblemShortRead])
def read_problems(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100
):
    """
    獲取題目清單。
    """
    problems = db.query(Problem.id, Problem.title, Problem.difficulty).filter(Problem.is_deleted == False).offset(skip).limit(limit).all()
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
    problem = db.query(Problem).filter(Problem.id == problem_id, Problem.is_deleted == False).first()
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
    current_user: User = Depends(get_questioner_user)
):
    """
    新增題目（含測試案例）。
    僅限 Admin 或 Questioner 執行。
    """
    db_problem = Problem(
        **problem_in.model_dump(exclude={"test_cases"}),
        creator_id=current_user.id,
        test_cases=[TestCase(**tc.model_dump()) for tc in problem_in.test_cases]
    )
    db.add(db_problem)
    db.commit()
    db.refresh(db_problem)
    return db_problem


@router.patch("/{problem_id}", response_model=ProblemRead)
def update_problem(
    *,
    db: Session = Depends(deps.get_db),
    problem_id: int,
    problem_in: ProblemUpdate,
    current_user: User = Depends(get_questioner_user)
):
    """
    修改題目資訊與測資。
    """
    db_problem = db.query(Problem).filter(Problem.id == problem_id, Problem.is_deleted == False).first()
    if not db_problem:
        raise HTTPException(status_code=404, detail="題目不存在")

    update_data = problem_in.model_dump(exclude_unset=True, exclude={"test_cases"})
    for field, value in update_data.items():
        setattr(db_problem, field, value)

    if problem_in.test_cases is not None:
        current_tcs = {tc.id: tc for tc in db_problem.test_cases}
        incoming_tc_ids = []

        for tc_data in problem_in.test_cases:
            if tc_data.id and tc_data.id in current_tcs:
                target_tc = current_tcs[tc_data.id]
                for field, value in tc_data.model_dump(exclude_unset=True).items():
                    setattr(target_tc, field, value)
                incoming_tc_ids.append(tc_data.id)
            else:
                new_tc = TestCase(
                    **tc_data.model_dump(exclude={"id"}), 
                    problem_id=db_problem.id
                )
                db.add(new_tc)
                
        for tc_id, tc_obj in current_tcs.items():
            if tc_id not in incoming_tc_ids:
                db.delete(tc_obj)

    db.commit()
    db.refresh(db_problem)
    return db_problem


@router.delete("/{problem_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_problem(
    *,
    db: Session = Depends(deps.get_db),
    problem_id: int,
    current_user: User = Depends(get_questioner_user)
):
    """
    刪除題目。
    """
    db_problem = db.query(Problem).filter(Problem.id == problem_id, Problem.is_deleted == False).first()
    if not db_problem:
        raise HTTPException(status_code=404, detail="題目不存在")
    
    db_problem.is_deleted = True

    db.add(db_problem)
    db.commit()
    return None

@router.get("/{id}/testcases", response_model=list[TestCaseRead])
def get_problem_testcases(
    id: int,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user)
):
    """
    獲取指定題目的完整測試資料（包含隱密輸入/輸出）
    - 僅限 Admin, Interviewer, Questioner
    """
    if current_user.role not in [UserRole.Admin, UserRole.Interviewer, UserRole.Questioner]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="權限不足，只有出題者或管理員可以查看完整測資。"
        )
    
    problem = db.query(Problem).filter(Problem.id == id).first()
    if not problem:
        raise HTTPException(status_code=404, detail="找不到指定的題目。")
    
    testcases = db.query(TestCase).filter(TestCase.problem_id == id).order_by(TestCase.id.asc()).all()

    return testcases