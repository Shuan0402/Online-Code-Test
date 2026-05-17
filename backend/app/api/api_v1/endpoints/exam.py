import uuid
from typing import List
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from app.api import deps
from app.models.exam import Exam, ExamProblem
from app.models.problem import Problem
from app.models.enums import UserRole, ExamStatus, DifficultyLevel
from app.models.submission import Submission
from app.models.problem import Problem
from app.schemas.exam import CandidateExamListRead, CandidateExamDetailRead, ExamResultRead, ExamProblemResultRead, ExamCreate, ExamRead

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

@router.post("/{exam_id}/start", response_model=CandidateExamDetailRead)
def start_exam(
    exam_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user)
):
    """
    開始進行考試 API。
    1. 鎖定狀態機：將 Published 改為 Ongoing
    2. 寫入 start_time，並由後端精準計算剩餘秒數
    3. 此時才加載題目明細，防止提早偷看題目
    """
    exam = (
        db.query(Exam)
        .options(joinedload(Exam.exam_problems))
        .filter(Exam.id == exam_id)
        .first()
    )

    if not exam:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="找不到指定的考試項目。"
        )

    if exam.candidate_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="您無權參與此場考試。"
        )

    now = datetime.now(timezone.utc)

    if exam.status == ExamStatus.Draft:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="該場考試尚未對外發布。"
        )

    elif exam.status == ExamStatus.Published:
        exam.status = ExamStatus.Ongoing
        exam.start_time = now
        db.commit()
        db.refresh(exam)

    elif exam.status in [ExamStatus.Finished, ExamStatus.Archived]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="您已完成本場考試，無法重複作答。"
        )

    total_duration_seconds = exam.duration_minutes * 60
    elapsed_seconds = (now - exam.start_time).total_seconds()
    remaining_seconds = int(total_duration_seconds - elapsed_seconds)

    if remaining_seconds <= 0:
        exam.status = ExamStatus.Finished
        exam.end_time = now
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="考試時間已截止，系統已自動收卷。"
        )

    exam.remaining_seconds = remaining_seconds
    return exam

@router.post("/{exam_id}/submit", response_model=CandidateExamListRead)
def submit_exam(
    exam_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user)
):
    """
    考生主動正式交卷 API。
    - 狀態由 Ongoing 變更為 Finished。
    - 寫入 end_time，結束該場測驗。
    - 阻斷非進行中（如 Published 或已 Finished）的惡意重複交卷。
    """
    exam = db.query(Exam).filter(Exam.id == exam_id).first()

    if not exam:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="找不到指定的考試項目。"
        )

    if exam.candidate_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="您無權對此場考試進行操作。"
        )

    if exam.status != ExamStatus.Ongoing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"目前考試狀態為 {exam.status}，非進行中狀態無法執行交卷。"
        )

    exam.status = ExamStatus.Finished
    exam.end_time = datetime.now(timezone.utc)
    
    db.commit()
    db.refresh(exam)
    return exam

@router.get("/{exam_id}/result", response_model=ExamResultRead)
def get_exam_result(
    exam_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user)
):
    """
    獲取該場考試的實時各題狀態與總得分 (Candidate/Interviewer 共用)
    - 考生只能看自己的考卷得分與狀態。
    - 管理員與面試官可以跨全局調閱受測學生的得分與狀態。
    - 自動計算該生在每道題目拿到的最新分數與狀態。
    """
    exam = (
        db.query(Exam)
        .options(joinedload(Exam.exam_problems))
        .filter(Exam.id == exam_id)
        .first()
    )

    if not exam:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="找不到指定的考試項目。"
        )

    if current_user.role == UserRole.Candidate and exam.candidate_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="您無權調閱此場考試的結果報告。"
        )
        
    if exam.status == ExamStatus.Draft and current_user.role == UserRole.Candidate:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="該場考試尚未對外發布。"
        )

    problem_results = []
    accumulated_exam_points = 0
    accumulated_candidate_score = 0

    for ep in exam.exam_problems:
        accumulated_exam_points += ep.points
        
        latest_sub = (
            db.query(Submission)
            .filter(
                Submission.exam_id == exam.id,
                Submission.user_id == exam.candidate_id,
                Submission.problem_id == ep.problem_id
            )
            .order_by(Submission.created_at.desc())
            .first()
        )
        
        p_score = latest_sub.score if latest_sub else 0
        p_status = latest_sub.status if latest_sub else "Unsubmitted"
        
        accumulated_candidate_score += p_score
        
        p_title = "Unknown Problem"
        if hasattr(ep, "title") and ep.title:
            p_title = ep.title
        elif hasattr(ep, "problem") and ep.problem:
            p_title = ep.problem.title

        problem_results.append(
            ExamProblemResultRead(
                problem_id=ep.problem_id,
                title=p_title,
                sequence=ep.sequence,
                max_points=ep.points,
                candidate_score=p_score,
                submission_status=p_status
            )
        )

    return ExamResultRead(
        id=exam.id,
        title=exam.title,
        status=exam.status,
        total_exam_points=accumulated_exam_points,
        total_candidate_score=accumulated_candidate_score,
        start_time=exam.start_time,
        end_time=exam.end_time,
        results=problem_results
    )

@router.post("/", response_model=ExamRead, status_code=status.HTTP_201_CREATED)
def create_exam_session(
    obj_in: ExamCreate,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user)
):
    """
    建立考試場次 API。
    - 限制只有 Interviewer 或 Admin 角色可以創建考試。
    - 考卷主考官自動綁定目前登入的後台人員。
    - 初始狀態一律鎖定為 Draft (草稿)。
    """
    if current_user.role not in [UserRole.Interviewer, UserRole.Admin]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="權限不足，只有面試官或管理員可以建立考試場次。"
        )

    new_exam = Exam(
        id=uuid.uuid4(),
        title=obj_in.title,
        duration_minutes=obj_in.duration_minutes,
        easy_count=obj_in.easy_count,
        medium_count=obj_in.medium_count,
        hard_count=obj_in.hard_count,
        status=ExamStatus.Draft,
        creator_id=current_user.id,
        candidate_id=obj_in.candidate_id
    )

    db.add(new_exam)
    db.commit()
    db.refresh(new_exam)
    return new_exam

@router.post("/{exam_id}/problems/generate", response_model=ExamRead)
def generate_exam_problems(
    exam_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user)
):
    """
    自動抽選題目 API。
    - 依據考試當初建立時設定的難易度配比 (easy, medium, hard_count)，從題庫中隨機抽題。
    - 抽完後自動編排題號順序 (sequence) 並計入 ExamProblem 表中。
    - 只有 Draft 草稿狀態的考試允許重新抽選題目。
    """
    if current_user.role not in [UserRole.Interviewer, UserRole.Admin]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="權限不足，只有面試官或管理員可以為考試抽選題目。"
        )

    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="找不到指定的考試項目。")

    if exam.status != ExamStatus.Draft:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"目前考試狀態為 {exam.status}，只有草稿 (Draft) 狀態能執行自動抽題。"
        )

    db.query(ExamProblem).filter(ExamProblem.exam_id == exam.id).delete()
    
    selected_problems = []
    difficulty_map = [
        (DifficultyLevel.Easy, exam.easy_count),
        (DifficultyLevel.Medium, exam.medium_count),
        (DifficultyLevel.Hard, exam.hard_count)
    ]

    for diff_level, count in difficulty_map:
        if count > 0:
            problems = (
                db.query(Problem)
                .filter(Problem.difficulty == diff_level)
                .order_by(func.random())
                .limit(count)
                .all()
            )
            
            if len(problems) < count:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"題庫中難度為 {diff_level} 的題目數量不足（需要 {count} 題，系統內僅存 {len(problems)} 題），無法生成考卷。"
                )
            selected_problems.extend(problems)

    for index, prob in enumerate(selected_problems):
        ep = ExamProblem(
            exam_id=exam.id,
            problem_id=prob.id,
            sequence=index + 1,
            points=100,
            problem=prob
        )
            
        db.add(ep)

    db.commit()
    
    return (
        db.query(Exam)
        .options(joinedload(Exam.exam_problems).joinedload(ExamProblem.problem))
        .filter(Exam.id == exam_id)
        .first()
    )