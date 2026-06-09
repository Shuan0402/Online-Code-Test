from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Annotated
from uuid import UUID

from app.api import deps
from app.models.user import User
from app.models.problem import Problem
from app.models.testcase import TestCase
from app.models.enums import UserRole
from app.models.submission import Submission
from app.models.enums import JudgeStatus
from app.schemas.testcase import RejudgeResponse
from app.schemas.problem import ProblemCreate, ProblemUpdate, ProblemRead, ProblemShortRead
from app.schemas.testcase import TestCaseRead, TestCaseCreate
from app.api.deps import get_questioner_user
from app.services.storage import StorageService
from app.services.queue_manager import queue_manager

router = APIRouter()

PROBLEM_NOT_FOUND = "找不到指定的題目。"

@router.get("/", response_model=List[ProblemShortRead])
def read_problems(
    db: Annotated[Session, Depends(deps.get_db)],
    skip: int = 0,
    limit: int = 100
):
    """
    獲取題目清單。
    """
    problems = db.query(Problem.id, Problem.title, Problem.difficulty).filter(Problem.is_deleted == False).offset(skip).limit(limit).all()
    return problems


@router.get("/{problem_id}", response_model=ProblemRead, responses={404: {"description": "題目不存在"}})
def read_problem(
    problem_id: int,
    db: Annotated[Session, Depends(deps.get_db)],
    current_user: Annotated[User, Depends(deps.get_current_user)]
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
    db: Annotated[Session, Depends(deps.get_db)],
    problem_in: ProblemCreate,
    current_user: Annotated[User, Depends(get_questioner_user)]
):
    """
    新增題目（含測試案例）。
    僅限 Admin 或 Questioner 執行。
    """
    # 檢查是否已存在同名且未刪除的題目
    existing = db.query(Problem).filter(Problem.title == problem_in.title, Problem.is_deleted == False).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="題目名稱已重複，請使用其他名稱。"
        )

    db_problem = Problem(
        **problem_in.model_dump(exclude={"test_cases"}),
        creator_id=current_user.id,
        test_cases=[TestCase(**tc.model_dump()) for tc in problem_in.test_cases]
    )
    db.add(db_problem)
    db.commit()
    db.refresh(db_problem)
    return db_problem


@router.patch("/{problem_id}", response_model=ProblemRead, responses={404: {"description": "題目不存在"}})
def update_problem(
    *,
    db: Annotated[Session, Depends(deps.get_db)],
    problem_id: int,
    problem_in: ProblemUpdate,
    current_user: Annotated[User, Depends(get_questioner_user)]
):
    """
    修改題目資訊與測資。
    """
    db_problem = db.query(Problem).filter(Problem.id == problem_id, Problem.is_deleted == False).first()
    if not db_problem:
        raise HTTPException(status_code=404, detail="題目不存在")

    if problem_in.title is not None:
        existing = db.query(Problem).filter(
            Problem.title == problem_in.title,
            Problem.id != problem_id,
            Problem.is_deleted == False
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="題目名稱已重複，請使用其他名稱。"
            )

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


@router.delete("/{problem_id}", status_code=status.HTTP_204_NO_CONTENT, responses={404: {"description": "題目不存在"}})
def delete_problem(
    *,
    db: Annotated[Session, Depends(deps.get_db)],
    problem_id: int,
    current_user: Annotated[User, Depends(get_questioner_user)]
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

@router.get("/{id}/testcases", response_model=list[TestCaseRead], responses={404: {"description": "找不到指定的題目。"}})
def get_problem_testcases(
    id: int,
    db: Annotated[Session, Depends(deps.get_db)],
    current_user: Annotated[User, Depends(deps.get_current_user)]
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
        raise HTTPException(status_code=404, detail=PROBLEM_NOT_FOUND)
    
    testcases = db.query(TestCase).filter(TestCase.problem_id == id).order_by(TestCase.id.asc()).all()

    return testcases

@router.post("/{id}/testcases", response_model=TestCaseRead, status_code=status.HTTP_201_CREATED, responses={404: {"description": "找不到指定的題目。"}})
def create_problem_testcase(
    id: int,
    obj_in: TestCaseCreate,
    db: Annotated[Session, Depends(deps.get_db)],
    current_user: Annotated[User, Depends(deps.get_current_user)]
):
    """
    為指定題目新增一筆測試資料
    - 僅限 Admin, Interviewer, Questioner
    """
    if current_user.role not in [UserRole.Admin, UserRole.Interviewer, UserRole.Questioner]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="權限不足，只有出題者或管理員可以新增測資。"
        )
    
    problem = db.query(Problem).filter(Problem.id == id).first()
    if not problem:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=PROBLEM_NOT_FOUND)
    
    db_obj = TestCase(
        problem_id=id,
        input_data=obj_in.input_data,
        expected_output=obj_in.expected_output,
        score_weight=obj_in.score_weight,
        is_sample=obj_in.is_sample
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    
    return db_obj

@router.post("/{id}/rejudge", response_model=RejudgeResponse, status_code=status.HTTP_202_ACCEPTED)
def rejudge_problem_submissions(
    id: int,
    db: Annotated[Session, Depends(deps.get_db)],
    storage_service: Annotated[StorageService, Depends(deps.get_storage)],
    current_user: Annotated[User, Depends(deps.get_questioner_user)]
):
    """
    一鍵重測該題目的所有歷史提交
    - 僅限 Questioner 與 Admin
    """
    problem = db.query(Problem).filter(Problem.id == id).first()
    if not problem:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=PROBLEM_NOT_FOUND)

    submissions = db.query(Submission).filter(Submission.problem_id == id).all()
    submission_count = len(submissions)

    if submission_count == 0:
        return RejudgeResponse(
            message="本題目目前尚無任何考生繳交紀錄，無需執行重測。",
            problem_id=id,
            submissions_triggered=0
        )

    latest_testcases = db.query(TestCase).filter(TestCase.problem_id == id).order_by(TestCase.id.asc()).all()
    
    testcases_payload = [
        {
            "testcase_id": tc.id,
            "input_data": tc.input_data,
            "expected_output": tc.expected_output
        }
        for tc in latest_testcases
    ]

    for sub in submissions:
        sub.status = JudgeStatus.Pending
        sub.score = 0
        db.add(sub)
    db.commit()

    for sub in submissions:
        presigned_url = storage_service.sign_get_url(sub.code_s3_url)
        
        worker_message = {
            "submission_id": str(sub.id),
            "submission_type": "OFFICIAL", 
            "presigned_url": presigned_url,
            "language": sub.language,
            "time_limit_ms": getattr(problem, "time_limit_ms", 2000), 
            "testcases": testcases_payload 
        }
        
        queue_manager.push_to_queue(queue_manager.QUEUE_PENDING, worker_message)

    return RejudgeResponse(
        message=f"已成功載入 {len(testcases_payload)} 筆最新測資，並將該題目的 {submission_count} 筆歷史提交推送至 Redis 評測佇列。",
        problem_id=id,
        submissions_triggered=submission_count
    )