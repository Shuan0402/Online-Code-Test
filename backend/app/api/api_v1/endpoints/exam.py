import uuid
from typing import List, Optional, Annotated
from app.models.user import User
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from pydantic import BaseModel

from app.api import deps
from app.models.candidate_tag import CandidateTag
from app.models.exam import Exam, ExamProblem, ViolationLog
from app.models.problem import Problem
from app.models.enums import UserRole, ExamStatus, DifficultyLevel
from app.models.submission import Submission
from app.models.testcase import TestCase
from app.models.problem import Problem
from app.schemas.exam import CandidateExamListRead, CandidateExamDetailRead, ExamResultRead, ExamProblemResultRead, ExamCreate, ExamRead, ExamUpdate, ExamProblemCreate, ExamBatchCreate, BatchExamCreateResult
from app.schemas.problem import ProblemRead, ProblemCandidateRead
from app.services.exam import exam_service
from app.services.tags import get_all_unique_tags

EXAM_NOT_FOUND = "找不到指定的考試項目。"

class ViolationReportSchema(BaseModel):
    violation_type: str
    details: str

router = APIRouter()


def _parse_date_start(date_str: str):
    """Parse a date/datetime string into a UTC-aware datetime for start filtering."""
    try:
        return datetime.fromisoformat(date_str).replace(tzinfo=timezone.utc)
    except ValueError:
        try:
            return datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            return None


def _parse_date_end(date_str: str):
    """Parse a date/datetime string into a UTC-aware datetime for end filtering.
    Pure dates are extended to 23:59:59 so the whole day is included.
    """
    if len(date_str) == 10:
        try:
            return datetime.strptime(date_str, "%Y-%m-%d").replace(
                hour=23, minute=59, second=59, tzinfo=timezone.utc
            )
        except ValueError:
            pass
    try:
        return datetime.fromisoformat(date_str).replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _apply_staff_exam_filters(query, current_user, candidate_id, mine, created_start, created_end):
    """Apply staff-only (Interviewer/Admin) query filters."""
    if candidate_id:
        query = query.filter(Exam.candidate_id == candidate_id)
    if mine:
        query = query.filter(Exam.creator_id == current_user.id)
    if created_start:
        start_dt = _parse_date_start(created_start)
        if start_dt:
            query = query.filter(Exam.created_at >= start_dt)
    if created_end:
        end_dt = _parse_date_end(created_end)
        if end_dt:
            query = query.filter(Exam.created_at <= end_dt)
    return query


def _sort_exam_list(filtered_exams: list, order_by: str) -> list:
    """Sort a list of (exam, pct) tuples according to the order_by parameter."""
    sort_keys = {
        "finished_at": (lambda x: (x[0].end_time is None, x[0].end_time), False),
        "-finished_at": (lambda x: (x[0].end_time is None, x[0].end_time), True),
        "score": (lambda x: x[1], False),
        "-score": (lambda x: x[1], True),
    }
    if order_by in sort_keys:
        key_fn, reverse = sort_keys[order_by]
        filtered_exams.sort(key=key_fn, reverse=reverse)
    else:
        filtered_exams.sort(key=lambda x: x[0].created_at, reverse=True)
    return filtered_exams


def _sort_problem_results(filtered_results: list, order_by: str) -> list:
    """Sort a list of ExamProblemResultRead according to the order_by parameter."""
    sort_map = {
        "finished_at": (lambda x: (x.finished_at is None, x.finished_at), False),
        "-finished_at": (lambda x: (x.finished_at is None, x.finished_at), True),
        "score": (lambda x: x.candidate_score, False),
        "-score": (lambda x: x.candidate_score, True),
    }
    if order_by in sort_map:
        key_fn, reverse = sort_map[order_by]
        filtered_results.sort(key=key_fn, reverse=reverse)
    else:
        filtered_results.sort(key=lambda x: x.sequence)
    return filtered_results


def _get_weight_by_problem(db: Session, problem_ids) -> dict:
    """Batch-fetch total score_weight per problem_id; returns empty dict when no ids."""
    if not problem_ids:
        return {}
    weight_rows = (
        db.query(TestCase.problem_id, func.sum(TestCase.score_weight))
        .filter(TestCase.problem_id.in_(problem_ids))
        .group_by(TestCase.problem_id)
        .all()
    )
    return {pid: (w or 0) for pid, w in weight_rows}


def _score_pct(score: float, total_points: float) -> float:
    """Return percentage score, 0.0 when total_points is zero."""
    return (score / total_points * 100.0) if total_points > 0 else 0.0


def _filter_exams_by_score(
    exams: list, weight_by_problem: dict, score_gte: Optional[float], score_lte: Optional[float]
) -> list:
    """Filter (exam, pct) pairs by score_gte / score_lte bounds."""
    result = []
    for exam in exams:
        total_points = sum(
            weight_by_problem.get(ep.problem_id, 0) or ep.points
            for ep in exam.exam_problems
        )
        pct = _score_pct(exam.score, total_points)
        if score_gte is not None and pct < score_gte:
            continue
        if score_lte is not None and pct > score_lte:
            continue
        result.append((exam, pct))
    return result


def _check_exam_start_preconditions(exam) -> None:
    """Raise HTTPException for invalid start-exam states.

    This guard is intentionally side-effect-free for all error paths so that the
    caller can commit only on the happy path.
    """
    if exam.status == ExamStatus.Draft:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="該場考試尚未對外發布。"
        )
    if exam.status in [ExamStatus.Finished, ExamStatus.Archived]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="您已完成本場考試，無法重複作答。"
        )


def _resolve_ep_title(ep) -> str:
    """Return the best available title for an ExamProblem row."""
    if hasattr(ep, "title") and ep.title:
        return ep.title
    if hasattr(ep, "problem") and ep.problem:
        return ep.problem.title
    return "Unknown Problem"


def _build_problem_result(ep, latest_sub, total_tc_weight: int):
    """Construct an ExamProblemResultRead from an ExamProblem and its latest submission."""
    p_score = latest_sub.score if latest_sub else 0
    p_status = latest_sub.status if latest_sub else "Unsubmitted"
    p_finished_at = latest_sub.created_at if latest_sub else None
    return ExamProblemResultRead(
        problem_id=ep.problem_id,
        title=_resolve_ep_title(ep),
        sequence=ep.sequence,
        max_points=total_tc_weight,
        candidate_score=p_score,
        submission_status=p_status,
        finished_at=p_finished_at,
    )


def _filter_problem_results_by_score(
    problem_results: list, score_gte: Optional[float], score_lte: Optional[float]
) -> list:
    """Filter ExamProblemResultRead items by per-problem percentage score bounds."""
    filtered = []
    for r in problem_results:
        pct = _score_pct(r.candidate_score, r.max_points)
        if score_gte is not None and pct < score_gte:
            continue
        if score_lte is not None and pct > score_lte:
            continue
        filtered.append(r)
    return filtered


@router.get("/", response_model=List[CandidateExamListRead])
def get_candidate_exams(
    db: Annotated[Session, Depends(deps.get_db)],
    candidate_id: Optional[uuid.UUID] = None,
    mine: Optional[bool] = None,
    tag: Optional[str] = None,
    score_gte: Optional[float] = None,
    score_lte: Optional[float] = None,
    created_start: Optional[str] = None,
    created_end: Optional[str] = None,
    order_by: Optional[str] = None,
    current_user: Annotated[User, Depends(deps.get_current_user)] = None
):
    """
    考試場次列表調閱 API (多角色權限分流一體化)
    - Interviewer / Admin (面試官/管理員): 預設撈取全系統所有考卷（含 Draft 草稿）。
      傳入 mine=true 時，只回傳自己建立的考試。
    - Candidate (一般考生): 只能看見指派給自己、且處於可檢視狀態（Published/Ongoing/Finished）的考卷。
    """
    if current_user.role in [UserRole.Interviewer, UserRole.Admin]:
        query = db.query(Exam).options(
            joinedload(Exam.exam_problems).joinedload(ExamProblem.problem),
            joinedload(Exam.candidate)
        )
        query = _apply_staff_exam_filters(query, current_user, candidate_id, mine, created_start, created_end)
        if tag:
            query = query.filter(Exam.tag == tag)
        exams = query.all()
    else:
        query = (
            db.query(Exam)
            .options(joinedload(Exam.exam_problems).joinedload(ExamProblem.problem))
            .filter(Exam.candidate_id == current_user.id, Exam.status != ExamStatus.Draft)
        )
        if tag:
            query = query.filter(Exam.tag == tag)
        exams = query.all()

    # 一次 batch 取所有出現過的 problem_id 的 testcase score_weight 總和，避免 N+1。
    problem_ids = {ep.problem_id for exam in exams for ep in exam.exam_problems}
    weight_by_problem = _get_weight_by_problem(db, problem_ids)

    filtered_exams = _filter_exams_by_score(exams, weight_by_problem, score_gte, score_lte)
    filtered_exams = _sort_exam_list(filtered_exams, order_by) if order_by else sorted(
        filtered_exams, key=lambda x: x[0].created_at, reverse=True
    )

    return [x[0] for x in filtered_exams]

@router.post("/{exam_id}/start", response_model=CandidateExamDetailRead)
def start_exam(
    exam_id: uuid.UUID,
    db: Annotated[Session, Depends(deps.get_db)],
    current_user: Annotated[User, Depends(deps.get_current_user)]
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
            detail=EXAM_NOT_FOUND
        )

    if exam.candidate_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="您無權參與此場考試。"
        )

    now = datetime.now(timezone.utc)

    _check_exam_start_preconditions(exam)

    if exam.status == ExamStatus.Published:
        exam.status = ExamStatus.Ongoing
        exam.start_time = now
        db.commit()
        db.refresh(exam)

    total_duration_seconds = exam.duration_minutes * 60
    start_time = exam.start_time
    if start_time and start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=timezone.utc)
    elapsed_seconds = (now - start_time).total_seconds() if start_time else 0
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
    db: Annotated[Session, Depends(deps.get_db)],
    current_user: Annotated[User, Depends(deps.get_current_user)]
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
            detail=EXAM_NOT_FOUND
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
    score_gte: Optional[float] = None,
    score_lte: Optional[float] = None,
    order_by: Optional[str] = None,
    db: Annotated[Session, Depends(deps.get_db)] = None,
    current_user: Annotated[User, Depends(deps.get_current_user)] = None
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
            detail=EXAM_NOT_FOUND
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

    ep_problem_ids = [ep.problem_id for ep in exam.exam_problems]
    weight_by_problem = _get_weight_by_problem(db, ep_problem_ids)

    problem_results = []
    accumulated_exam_points = 0
    accumulated_candidate_score = 0

    for ep in exam.exam_problems:
        total_tc_weight = weight_by_problem.get(ep.problem_id, 0) or ep.points
        accumulated_exam_points += total_tc_weight
        
        # 排除 RUN_ONLY 試跑（試跑不計分）— 只取 OFFICIAL 最新一筆當該題的繳交紀錄。
        latest_sub = (
            db.query(Submission)
            .filter(
                Submission.exam_id == exam.id,
                Submission.user_id == exam.candidate_id,
                Submission.problem_id == ep.problem_id,
                Submission.submission_type == "OFFICIAL",
            )
            .order_by(Submission.created_at.desc())
            .first()
        )

        entry = _build_problem_result(ep, latest_sub, total_tc_weight)
        accumulated_candidate_score += entry.candidate_score
        problem_results.append(entry)

    # Python-side filtering & sorting for single exam problems
    filtered_results = _filter_problem_results_by_score(problem_results, score_gte, score_lte)
    filtered_results = _sort_problem_results(filtered_results, order_by) if order_by else sorted(
        filtered_results, key=lambda x: x.sequence
    )

    return ExamResultRead(
        id=exam.id,
        title=exam.title,
        status=exam.status,
        total_exam_points=accumulated_exam_points,
        total_candidate_score=accumulated_candidate_score,
        start_time=exam.start_time,
        end_time=exam.end_time,
        results=filtered_results
    )

@router.post("/", response_model=ExamRead, status_code=status.HTTP_201_CREATED)
def create_exam_session(
    obj_in: ExamCreate,
    db: Annotated[Session, Depends(deps.get_db)],
    current_user: Annotated[User, Depends(deps.get_current_user)]
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
        tag=obj_in.tag,
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


@router.post("/batch", response_model=BatchExamCreateResult, status_code=status.HTTP_201_CREATED)
def create_exam_session_batch(
    obj_in: ExamBatchCreate,
    db: Annotated[Session, Depends(deps.get_db)],
    current_user: Annotated[User, Depends(deps.get_current_user)]
):
    """
    批次建立考試 API。
    - 限制只有 Interviewer 或 Admin 角色可以使用。
    - 依據指定的標籤 (tag)，為所有擁有該標籤的考生建立同一場考試。
    - 可選擇建立後是否自動抽選題目 (auto_generate)。
    - 回傳成功建立的考試清單及統計資訊。
    """
    if current_user.role not in [UserRole.Interviewer, UserRole.Admin]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="權限不足，只有面試官或管理員可以批次建立考試場次。"
        )

    # 查詢所有擁有該標籤的考生
    candidates_with_tag = (
        db.query(User)
        .join(CandidateTag, User.id == CandidateTag.user_id)
        .filter(CandidateTag.tag == obj_in.tag)
        .filter(User.role == UserRole.Candidate)
        .filter(User.is_active == True)
        .all()
    )

    if not candidates_with_tag:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"找不到任何擁有標籤「{obj_in.tag}」的活躍考生。"
        )

    created_exams = []
    errors = []
    total_requested = len(candidates_with_tag)

    for candidate in candidates_with_tag:
        try:
            new_exam = Exam(
                id=uuid.uuid4(),
                title=obj_in.title,
                tag=obj_in.tag,
                duration_minutes=obj_in.duration_minutes,
                easy_count=obj_in.easy_count,
                medium_count=obj_in.medium_count,
                hard_count=obj_in.hard_count,
                status=ExamStatus.Draft,
                creator_id=current_user.id,
                candidate_id=candidate.id,
            )
            db.add(new_exam)
            db.flush()  # 獲取 ID，但不提交整個交易

            # 若需要自動抽選題目
            if obj_in.auto_generate and (obj_in.easy_count > 0 or obj_in.medium_count > 0 or obj_in.hard_count > 0):
                difficulty_gap = [
                    (DifficultyLevel.Easy, obj_in.easy_count),
                    (DifficultyLevel.Medium, obj_in.medium_count),
                    (DifficultyLevel.Hard, obj_in.hard_count),
                ]
                allocated_ids = []
                new_selected_problems = []
                for diff_level, gap_count in difficulty_gap:
                    if gap_count > 0:
                        problems = _select_problems_for_gap(db, diff_level, gap_count, allocated_ids)
                        new_selected_problems.extend(problems)
                        allocated_ids.extend([p.id for p in problems])

                for index, prob in enumerate(new_selected_problems):
                    ep = ExamProblem(
                        exam_id=new_exam.id,
                        problem_id=prob.id,
                        sequence=index + 1,
                        points=100,
                    )
                    db.add(ep)

            db.flush()
            db.refresh(new_exam)
            created_exams.append(new_exam)
        except Exception as e:
            errors.append(f"考生 {candidate.full_name or candidate.username} (ID: {candidate.id}) 建立失敗: {str(e)}")

    # 全部成功才一次提交
    if not errors:
        db.commit()
    else:
        db.rollback()
        # 若全部失敗則拋錯
        if not created_exams:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"批次建立考試全部失敗: {'; '.join(errors)}"
            )
        # 部分成功則只提交成功的部分
        # 由於上面是逐個 flush，若部分失敗需全部 rollback
        # 簡單做法：全部 rollback 後只重建成功的
        # 但為了保持一致性，若有任何錯誤就全部 rollback
        # 此處改為：重新建立成功的部份
        created_exams_retry = []
        for candidate in candidates_with_tag:
            try:
                new_exam = Exam(
                    id=uuid.uuid4(),
                    title=obj_in.title,
                    tag=obj_in.tag,
                    duration_minutes=obj_in.duration_minutes,
                    easy_count=obj_in.easy_count,
                    medium_count=obj_in.medium_count,
                    hard_count=obj_in.hard_count,
                    status=ExamStatus.Draft,
                    creator_id=current_user.id,
                    candidate_id=candidate.id,
                )
                db.add(new_exam)
                db.flush()

                if obj_in.auto_generate and (obj_in.easy_count > 0 or obj_in.medium_count > 0 or obj_in.hard_count > 0):
                    difficulty_gap = [
                        (DifficultyLevel.Easy, obj_in.easy_count),
                        (DifficultyLevel.Medium, obj_in.medium_count),
                        (DifficultyLevel.Hard, obj_in.hard_count),
                    ]
                    allocated_ids = []
                    new_selected_problems = []
                    for diff_level, gap_count in difficulty_gap:
                        if gap_count > 0:
                            problems = _select_problems_for_gap(db, diff_level, gap_count, allocated_ids)
                            new_selected_problems.extend(problems)
                            allocated_ids.extend([p.id for p in problems])

                    for index, prob in enumerate(new_selected_problems):
                        ep = ExamProblem(
                            exam_id=new_exam.id,
                            problem_id=prob.id,
                            sequence=index + 1,
                            points=100,
                        )
                        db.add(ep)

                db.flush()
                db.refresh(new_exam)
                created_exams_retry.append(new_exam)
            except Exception:
                pass  # 忽略重建中仍失敗的考生

        db.commit()
        created_exams = created_exams_retry

    return BatchExamCreateResult(
        created_exams=created_exams,
        total_requested=total_requested,
        success_count=len(created_exams),
        failed_count=total_requested - len(created_exams),
        errors=errors,
    )

def _count_problems_by_difficulty(exam_problems: list) -> dict:
    """Count existing ExamProblem entries grouped by difficulty level."""
    counts = {
        DifficultyLevel.Easy: 0,
        DifficultyLevel.Medium: 0,
        DifficultyLevel.Hard: 0,
    }
    for ep in exam_problems:
        if ep.problem and ep.problem.difficulty:
            counts[ep.problem.difficulty] += 1
    return counts


def _select_problems_for_gap(
    db: Session, diff_level, gap_count: int, allocated_ids: list
) -> list:
    """Fetch `gap_count` random problems of `diff_level` excluding `allocated_ids`.

    Raises HTTPException(400) when the pool is insufficient.
    """
    problems = (
        db.query(Problem)
        .filter(Problem.difficulty == diff_level)
        .filter(~Problem.id.in_(allocated_ids) if allocated_ids else True)
        .order_by(func.random())
        .limit(gap_count)
        .all()
    )
    if len(problems) < gap_count:
        raise HTTPException(  # NOSONAR
            status_code=400,
            detail=f"題庫中 {diff_level} 難度題目數量不足，無法補滿考卷空缺。"
        )
    return problems


@router.post("/{exam_id}/problems/generate", response_model=ExamRead)
def generate_exam_problems(
    exam_id: uuid.UUID,
    db: Annotated[Session, Depends(deps.get_db)],
    current_user: Annotated[User, Depends(deps.get_current_user)]
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=EXAM_NOT_FOUND)

    if exam.status in [ExamStatus.Ongoing, ExamStatus.Finished, ExamStatus.Archived]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"目前考試狀態為 {exam.status}，不允許變更題目配置。"
        )

    current_counts = _count_problems_by_difficulty(exam.exam_problems)
    difficulty_gap = [
        (DifficultyLevel.Easy, max(0, exam.easy_count - current_counts[DifficultyLevel.Easy])),
        (DifficultyLevel.Medium, max(0, exam.medium_count - current_counts[DifficultyLevel.Medium])),
        (DifficultyLevel.Hard, max(0, exam.hard_count - current_counts[DifficultyLevel.Hard])),
    ]

    allocated_ids = [ep.problem_id for ep in exam.exam_problems]
    new_selected_problems = []

    for diff_level, gap_count in difficulty_gap:
        if gap_count > 0:
            problems = _select_problems_for_gap(db, diff_level, gap_count, allocated_ids)
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
    db: Annotated[Session, Depends(deps.get_db)],
    current_user: Annotated[User, Depends(deps.get_current_user)]
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=EXAM_NOT_FOUND)

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

    expected_total = (exam.easy_count or 0) + (exam.medium_count or 0) + (exam.hard_count or 0)
    actual_total = len(exam.exam_problems)
    if actual_total < expected_total:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"發布失敗！本場考試設定題數為 {expected_total} 題，但目前僅配置 {actual_total} 題，題目數量不足。"
        )

    exam.status = ExamStatus.Published
    db.commit()
    db.refresh(exam)
    return exam

@router.get("/tags", response_model=List[str])
def get_unique_tags(
    db: Annotated[Session, Depends(deps.get_db)],
    current_user: Annotated[User, Depends(deps.get_current_user)]
):
    """
    獲取系統中所有已使用的考試標籤清單
    """
    if current_user.role not in [UserRole.Interviewer, UserRole.Admin]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="權限不足，只有面試官或管理員可以獲取標籤清單。"
        )
    return get_all_unique_tags(db)

@router.get("/{exam_id}", response_model=ExamRead)
def get_exam_session_by_id(
    exam_id: uuid.UUID,
    db: Annotated[Session, Depends(deps.get_db)],
    current_user: Annotated[User, Depends(deps.get_current_user)]
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
            detail=EXAM_NOT_FOUND
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
    db: Annotated[Session, Depends(deps.get_db)],
    current_user: Annotated[User, Depends(deps.get_current_user)]
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
            detail=EXAM_NOT_FOUND
        )

    if exam.status == ExamStatus.Ongoing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="目前正在考試，無法修改考試資訊"
        )

    update_data = obj_in.model_dump(exclude_unset=True)

    # Bug 7：easy_count / medium_count / hard_count 只能在 Draft 狀態下調整。
    # 一旦發布或結束、題目配比就是已敲定的紀錄、不准回頭改。
    count_fields = {"easy_count", "medium_count", "hard_count"}
    if count_fields & set(update_data) and exam.status != ExamStatus.Draft:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="只有草稿 (Draft) 狀態的考試可以修改題數配比。"
        )

    for field, value in update_data.items():
        setattr(exam, field, value)

    db.commit()
    db.refresh(exam)
    return exam

@router.delete("/{exam_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_exam_session(
    exam_id: uuid.UUID,
    db: Annotated[Session, Depends(deps.get_db)],
    current_user: Annotated[User, Depends(deps.get_current_user)]
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

def _resolve_target_problem_id(db: Session, obj_in, exam):
    """Return the problem_id to add, resolving random_difficulty when no explicit id given.

    Raises HTTPException when random mode finds no available problem.
    """
    if not (obj_in.random_difficulty and not obj_in.problem_id):
        return obj_in.problem_id
    exist_ids = [ep.problem_id for ep in exam.exam_problems]
    random_prob = (
        db.query(Problem)
        .filter(Problem.difficulty == obj_in.random_difficulty)
        .filter(~Problem.id.in_(exist_ids) if exist_ids else True)
        .order_by(func.random())
        .first()
    )
    if not random_prob:
        raise HTTPException(  # NOSONAR
            status_code=400,
            detail=f"題庫中已無更多未使用的 {obj_in.random_difficulty} 難度題目可供隨機抽選"
        )
    return random_prob.id


@router.post("/{exam_id}/problems", response_model=ExamRead)
def add_exam_problem_manual(
    exam_id: uuid.UUID,
    obj_in: ExamProblemCreate,
    db: Annotated[Session, Depends(deps.get_db)],
    current_user: Annotated[User, Depends(deps.get_current_user)]
):
    """
    面試主管手動指派加題 API
    - 僅限管理員/面試官，且考卷必須處於 Draft 狀態才允許手動塞題。
    """
    if current_user.role not in [UserRole.Interviewer, UserRole.Admin]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="權限不足，只有面試官或管理員可以手動指派題目。"
        )

    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="找不到指定的考試場次")

    if exam.status in [ExamStatus.Ongoing, ExamStatus.Finished, ExamStatus.Archived]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"目前考場狀態為 {exam.status}，不允許變更題目配置。"
        )

    target_problem_id = _resolve_target_problem_id(db, obj_in, exam)

    existing_ep = db.get(ExamProblem, (exam_id, target_problem_id))
    if existing_ep:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="該題目已存在於本張試卷中，請勿重複添加。"
        )

    problem = db.query(Problem).filter(Problem.id == target_problem_id).first()
    if not problem:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"題庫中查無此題目 (ID: {target_problem_id})")

    max_seq = db.query(func.max(ExamProblem.sequence)).filter(ExamProblem.exam_id == exam_id).scalar()
    db_exam_problem = ExamProblem(
        exam_id=exam_id,
        problem_id=target_problem_id,
        sequence=(max_seq or 0) + 1,
        points=obj_in.points
    )
    db.add(db_exam_problem)
    db.commit()
    db.refresh(exam)
    return exam

@router.get("/{exam_id}/problems")
def get_exam_problems(
    exam_id: uuid.UUID,
    db: Annotated[Session, Depends(deps.get_db)],
    current_user: Annotated[User, Depends(deps.get_current_user)]
):
    """
    獲取特定考試場次配置的所有題目清單
    - Admin/Interviewer 可看全域；
    - Candidate 僅限看自己名下的場次，且只能看到 is_sample = True 的範例測資
    """
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="找不到該筆考試場次。"
        )

    if current_user.role == UserRole.Candidate and str(exam.candidate_id) != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="權限不足，您無權存取此非本人名下的考試場次。"
        )

    problems = db.query(Problem)\
        .join(ExamProblem, Problem.id == ExamProblem.problem_id)\
        .filter(ExamProblem.exam_id == exam_id)\
        .all()
    
    if current_user.role == UserRole.Candidate:
        safe_problems = []
        for p in problems:
            public_test_cases = [tc for tc in p.test_cases if tc.is_sample is True]
            
            p_data = ProblemCandidateRead.model_validate(p)
            p_data.test_cases = public_test_cases
            safe_problems.append(p_data)
            
        return safe_problems

    return [ProblemRead.model_validate(p) for p in problems]

@router.delete("/{exam_id}/problems/{p_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_exam_problem(
    exam_id: uuid.UUID,
    p_id: int,
    db: Annotated[Session, Depends(deps.get_db)],
    current_user: Annotated[User, Depends(deps.get_staff_user)]
):
    """
    從指定考試場次中，移除特定的一道題目
    - 僅限 Admin, Interviewer
    - 如果考試已經開始，禁止任何人拔題
    """
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="找不到該筆考試場次。")
    
    if exam.status in [ExamStatus.Ongoing, ExamStatus.Finished, ExamStatus.Archived]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"該場考試目前狀態為 [{exam.status}]，不允許變更題目配置。"
        )
    
    assoc = db.query(ExamProblem).filter(
        ExamProblem.exam_id == exam_id,
        ExamProblem.problem_id == p_id
    ).first()
    
    if not assoc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="在該場考試中找不到此題目的配置紀錄。"
        )

    db.delete(assoc)
    db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)

@router.post("/{exam_id}/violation", status_code=status.HTTP_201_CREATED)
async def report_exam_violation(
    exam_id: uuid.UUID,
    payload: ViolationReportSchema,
    db: Annotated[Session, Depends(deps.get_db)],
    current_user: Annotated[User, Depends(deps.get_current_user)]
):
    """
    接收前端上報的面試者切頁、大量複製貼上等誠信違規事件
    """
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="找不到該場考試")  # NOSONAR
        
    new_log = ViolationLog(
        exam_id=exam_id,
        violation_type=payload.violation_type,
        details=payload.details
    )
    db.add(new_log)
    db.commit()
    return {"status": "success", "message": "違規事件已同步存檔入庫"}