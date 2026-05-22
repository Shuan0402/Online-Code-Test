import uuid
from typing import List, Optional
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
from app.schemas.exam import CandidateExamListRead, CandidateExamDetailRead, ExamResultRead, ExamProblemResultRead, ExamCreate, ExamRead, ExamUpdate, ExamProblemCreate

router = APIRouter()

@router.get("/", response_model=List[CandidateExamListRead])
def get_candidate_exams(
    db: Session = Depends(deps.get_db),
    candidate_id: Optional[uuid.UUID] = None,
    current_user = Depends(deps.get_current_user)
):
    """
    考試場次列表調閱 API (多角色權限分流一體化)
    - Interviewer / Admin (面試官/管理員): 撈取全系統所有考卷（含 Draft 草稿）。
    - Candidate (一般考生): 只能看見指派給自己、且處於可檢視狀態（Published/Ongoing/Finished）的考卷。
    """
    if current_user.role in [UserRole.Interviewer, UserRole.Admin]:
        query = db.query(Exam).options(
            joinedload(Exam.exam_problems).joinedload(ExamProblem.problem),
            joinedload(Exam.candidate)
        )
        
        if candidate_id:
            query = query.filter(Exam.candidate_id == candidate_id)
            
        exams = query.order_by(Exam.created_at.desc()).all()
        
    else:
        exams = (
            db.query(Exam)
            .options(
                joinedload(Exam.exam_problems).joinedload(ExamProblem.problem)
            )
            .filter(
                Exam.candidate_id == current_user.id,
                Exam.status != ExamStatus.Draft
            )
            .order_by(Exam.created_at.desc())
            .all()
        )

    for exam in exams:
        for ep in exam.exam_problems:
            if ep.problem:
                ep.title = ep.problem.title
                ep.difficulty = ep.problem.difficulty

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
        .options(joinedload(Exam.exam_problems).joinedload(ExamProblem.problem))
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

    subq = (
        db.query(
            Submission.problem_id,
            func.max(Submission.created_at).label("max_ts")
        )
        .filter(Submission.exam_id == exam.id, Submission.user_id == exam.candidate_id)
        .group_by(Submission.problem_id)
        .subquery()
    )
    
    latest_subs = (
        db.query(Submission)
        .join(subq, (Submission.problem_id == subq.c.problem_id) & (Submission.created_at == subq.c.max_ts))
        .filter(Submission.exam_id == exam.id, Submission.user_id == exam.candidate_id)
        .all()
    )
    sub_map = {s.problem_id: s for s in latest_subs}

    problem_results = []
    accumulated_exam_points = 0
    accumulated_candidate_score = 0

    for ep in exam.exam_problems:
        accumulated_exam_points += ep.points
        
        latest_sub = sub_map.get(ep.problem_id)
        
        p_score = latest_sub.score if latest_sub else 0
        p_status = latest_sub.status if latest_sub else "Unsubmitted"
        
        accumulated_candidate_score += p_score
        
        p_title = ep.problem.title if ep.problem else "Unknown Problem"

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
    - 保留現有手動挑好的題目，僅針對「未補滿的差額」進行隨機抽題。
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
    
    current_counts = {
        DifficultyLevel.Easy: 0,
        DifficultyLevel.Medium: 0,
        DifficultyLevel.Hard: 0
    }
    for ep in exam.exam_problems:
        if ep.problem and ep.problem.difficulty:
            current_counts[ep.problem.difficulty] += 1

    difficulty_gap = [
        (DifficultyLevel.Easy, max(0, exam.easy_count - current_counts[DifficultyLevel.Easy])),
        (DifficultyLevel.Medium, max(0, exam.medium_count - current_counts[DifficultyLevel.Medium])),
        (DifficultyLevel.Hard, max(0, exam.hard_count - current_counts[DifficultyLevel.Hard]))
    ]

    allocated_ids = [ep.problem_id for ep in exam.exam_problems]
    new_selected_problems = []

    for diff_level, gap_count in difficulty_gap:
        if gap_count > 0:
            problems = (
                db.query(Problem)
                .filter(Problem.difficulty == diff_level)
                .filter(~Problem.id.in_(allocated_ids) if allocated_ids else True)
                .order_by(func.random())
                .limit(gap_count)
                .all()
            )
            if len(problems) < gap_count:
                raise HTTPException(status_code=400, detail=f"題庫中 {diff_level} 難度題目數量不足，無法補滿考卷空缺。")
            
            new_selected_problems.extend(problems)
            allocated_ids.extend([p.id for p in problems])

    max_seq = db.query(func.max(ExamProblem.sequence)).filter(ExamProblem.exam_id == exam.id).scalar() or 0
    for index, prob in enumerate(new_selected_problems):
        ep = ExamProblem(
            exam_id=exam.id,
            problem_id=prob.id,
            sequence=max_seq + index + 1,
            points=100
        )
        db.add(ep)

    db.commit()
    
    return (
        db.query(Exam)
        .options(joinedload(Exam.exam_problems).joinedload(ExamProblem.problem))
        .filter(Exam.id == exam_id)
        .first()
    )

@router.post("/{exam_id}/publish", response_model=ExamRead)
def publish_exam_session(
    exam_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user)
):
    """
    發布考試場次 API。
    - 只有面試官或管理員可以發布。
    - 考卷必須為 Draft 狀態。
    - 考卷內必須「實體包含至少一道題目」才允許發布。
    """
    if current_user.role not in [UserRole.Interviewer, UserRole.Admin]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="權限不足，只有面試官或管理員可以發布考試場次。"
        )

    exam = (
        db.query(Exam)
        .options(joinedload(Exam.exam_problems).joinedload(ExamProblem.problem))
        .filter(Exam.id == exam_id)
        .first()
    )
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="找不到指定的考試項目。")

    if exam.status != ExamStatus.Draft:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"目前考試狀態為 {exam.status}。只有草稿狀態的考試可以被發布。"
        )

    if not exam.exam_problems or len(exam.exam_problems) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="發布失敗！本場考試尚未配置任何實體題目，請先自動抽選題目。"
        )

    exam.status = ExamStatus.Published
    db.commit()
    db.refresh(exam)
    return exam

@router.get("/{exam_id}", response_model=ExamRead)
def get_exam_session_by_id(
    exam_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user)
):
    """
    單一考試場次詳細調閱 API。
    - 面試官 / 管理員：可直接調閱系統內任意場次（含 Draft 草稿）。
    - 一般考生：限制只能查看指派給自己的考卷，若該考卷處於 Draft (草稿) 狀態，強制阻斷查看。
    """
    exam = (
        db.query(Exam)
        .options(
            joinedload(Exam.exam_problems).joinedload(ExamProblem.problem),
            joinedload(Exam.candidate)
        )
        .filter(Exam.id == exam_id)
        .first()
    )

    if not exam:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="找不到指定的考試項目。"
        )

    if current_user.role not in [UserRole.Interviewer, UserRole.Admin]:
        if exam.candidate_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="權限不足，您無法查看不屬於您的考試場次。"
            )
        
        if exam.status == ExamStatus.Draft:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="權限不足，該考試目前處於草稿階段，尚未對考生開放。"
            )

    return exam

@router.patch("/{exam_id}", response_model=ExamRead)
def update_exam_session(
    exam_id: uuid.UUID,
    obj_in: ExamUpdate,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user)
):
    """
    # 修改考試設定 API。
    - 限制只有 Interviewer 或 Admin 角色可以修改考試。
    - 只有處於草稿或發布狀態的考試允許變更，一旦開考則禁止修改。
    """
    if current_user.role not in [UserRole.Interviewer, UserRole.Admin]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="權限不足，只有面試官或管理員可以修改考試設定。"
        )

    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="找不到指定的考試項目。"
        )

    if exam.status != ExamStatus.Draft:
        raise HTTPException(
            status_code=400,
            detail=f"目前考試狀態為 {exam.status}，只有草稿 (Draft) 狀態允許變更基本設定。"
        )

    update_data = obj_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(exam, field, value)

    db.commit()
    
    return (
        db.query(Exam)
        .options(joinedload(Exam.exam_problems).joinedload(ExamProblem.problem))
        .filter(Exam.id == exam_id)
        .first()
    )

@router.delete("/{exam_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_exam_session(
    exam_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user)
):
    """
    刪除考試場次 API。
    - 限制只有 Interviewer 或 Admin 角色可以刪除考試。
    - 僅允許刪除 Draft 或 Published 狀態的考試。
    - 若考試正處於 Ongoing (進行中) 或 Finished (已結束)，禁止刪除以維護數據完整性。
    """
    if current_user.role not in [UserRole.Interviewer, UserRole.Admin]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="權限不足，只有面試官或管理員可以刪除考試場次。"
        )

    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="找不到指定的考試項目。"
        )

    if exam.status == ExamStatus.Ongoing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="目前考試正在進行中，禁止清理操作。"
        )
    
    if exam.status == ExamStatus.Finished:
        exam.status = ExamStatus.Archived
        db.commit()
        return

    db.delete(exam)
    db.commit()
    
    return

@router.post("/{exam_id}/problems", response_model=ExamRead)
def add_exam_problem_manual(
    exam_id: uuid.UUID,
    obj_in: ExamProblemCreate,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_interviewer_user)
):
    """
    面試主管手動指派加題 API
    - 僅限管理員/面試官，且考卷必須處於 Draft 狀態才允許手動塞題。
    """ 
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="找不到指定的考試場次")
    
    if exam.status != ExamStatus.Draft:
        raise HTTPException(
            status_code=400,
            detail=f"不允許操作：只有在 Draft (草稿) 狀態才允許修改題目清單。"
        )
    
    target_problem_id = obj_in.problem_id

    if obj_in.random_difficulty and not target_problem_id:
        exist_ids = [ep.problem_id for ep in exam.exam_problems]
        random_prob = (
            db.query(Problem)
            .filter(Problem.difficulty == obj_in.random_difficulty)
            .filter(~Problem.id.in_(exist_ids) if exist_ids else True)
            .order_by(func.random())
            .first()
        )
        if not random_prob:
            raise HTTPException(status_code=400, detail=f"題庫中已無更多未使用的 {obj_in.random_difficulty} 難度題目")
        target_problem_id = random_prob.id

    existing_ep = db.get(ExamProblem, (exam_id, target_problem_id))
    if existing_ep:
        raise HTTPException(status_code=400, detail="該題目已存在於本張試卷中，請勿重複添加。")

    problem = db.query(Problem).filter(Problem.id == target_problem_id).first()
    if not problem:
        raise HTTPException(status_code=404, detail=f"題庫中查無此題目 (ID: {target_problem_id})")

    max_seq = db.query(func.max(ExamProblem.sequence)).filter(ExamProblem.exam_id == exam_id).scalar()
    db_exam_problem = ExamProblem(
        exam_id=exam_id,
        problem_id=target_problem_id,
        sequence=(max_seq or 0) + 1,
        points=obj_in.points
    )
    db.add(db_exam_problem)
    db.commit()

    return (
        db.query(Exam)
        .options(joinedload(Exam.exam_problems).joinedload(ExamProblem.problem))
        .filter(Exam.id == exam_id)
        .first()
    )
