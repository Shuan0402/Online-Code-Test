"""
Seed exams for Candidate L2 regression Playwright tests.

Run inside backend container:
    docker compose exec backend python -m app.scripts.seed_e2e_candidate

Idempotent: looks up exams by exact title and updates fields in place, so
running it twice resets the "倒數歸零" exam back to remaining ≈ 8 seconds.
"""

import logging
import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.user import User, UserRole
from app.models.problem import Problem
from app.models.exam import Exam, ExamProblem
from app.models.submission import Submission, SubmissionDetail
from app.models.testcase import TestCase
from app.models.enums import DifficultyLevel, ExamStatus, JudgeStatus

logger = logging.getLogger("seed-e2e-candidate")
logging.basicConfig(level=logging.INFO, format="%(message)s")

# 三張要灌的考試 — 用 title 當 idempotent key。
DEMO_CANDIDATE_USERNAME = "demo_candidate"
OTHER_CANDIDATE_USERNAME = "candidate@nthu.edu.tw"

# 倒數歸零測試：進場後幾秒會自動觸發 FinalizeModal。8 秒給 Playwright 進場 + 倒數的緩衝。
TIMEOUT_REMAINING_SECONDS = 8


def _get_required_user(db: Session, username: str) -> User:
    user = db.query(User).filter(User.username == username).first()
    if not user:
        sys.exit(f"找不到必要帳號：{username} — 請先跑 init_db / 建立 demo_candidate。")
    return user


def _get_any_questioner(db: Session) -> User:
    q = db.query(User).filter(User.role == UserRole.Questioner).first()
    if not q:
        sys.exit("DB 沒有任何 Questioner，無法當 creator。")
    return q


def _get_or_create_demo_problem(db: Session, creator_id) -> Problem:
    p = db.query(Problem).filter(Problem.title == "兩數相加 (demo)").first()
    if p is None:
        p = Problem(
            creator_id=creator_id,
            title="兩數相加 (demo)",
            description=(
                "讀取一行兩個以空白分隔的整數 a b，輸出 a+b。\n"
                "例如：輸入 `3 5`，輸出 `8`。"
            ),
            difficulty=DifficultyLevel.Easy,
            time_limit_ms=1000,
            memory_limit_mb=128,
        )
        db.add(p)
        db.flush()
        logger.info(f"[建立] demo problem {p.title} id={p.id}")

    testcases = db.query(TestCase).filter(TestCase.problem_id == p.id).order_by(TestCase.id.asc()).all()
    if len(testcases) == 0:
        db.add(TestCase(problem_id=p.id, input_data="3 5\n", expected_output="8\n", is_sample=True, score_weight=50))
        db.add(TestCase(problem_id=p.id, input_data="100 200\n", expected_output="300\n", is_sample=False, score_weight=50))
        db.commit()
        db.refresh(p)
        logger.info(f"[建立] demo problem testcases for {p.title} id={p.id}")

    return p


def _upsert_exam(
    db: Session,
    *,
    title: str,
    creator_id,
    candidate_id,
    status: ExamStatus,
    duration_minutes: int,
    start_time,
    end_time,
    problem_id: int,
) -> Exam:
    exam = db.query(Exam).filter(Exam.title == title).first()
    if exam is None:
        exam = Exam(
            title=title,
            creator_id=creator_id,
            candidate_id=candidate_id,
            duration_minutes=duration_minutes,
            status=status,
            start_time=start_time,
            end_time=end_time,
            easy_count=1,
            medium_count=0,
            hard_count=0,
        )
        db.add(exam)
        db.flush()
        action = "建立"
    else:
        exam.creator_id = creator_id
        exam.candidate_id = candidate_id
        exam.duration_minutes = duration_minutes
        exam.status = status
        exam.start_time = start_time
        exam.end_time = end_time
        action = "重置"

    db.query(ExamProblem).filter(ExamProblem.exam_id == exam.id).delete()
    db.add(ExamProblem(exam_id=exam.id, problem_id=problem_id, sequence=1, points=100))

    db.commit()
    db.refresh(exam)
    logger.info(f"[{action}] {title}  id={exam.id}  status={exam.status.value}")
    return exam


def _ensure_synthetic_submission(
    db: Session,
    *,
    user_id,
    exam_id,
    problem_id: int,
) -> None:
    """
    為 E2 testcase 表格 spec 造一筆「有 details 的合成 submission」。
    冪等：以 (user_id, exam_id, problem_id, judge_log marker) 為 key。
    需要該題已有 TestCase 記錄；否則 skip（不要硬塞）。
    """
    marker = "[E2E synthetic submission]"
    existing = (
        db.query(Submission)
        .filter(
            Submission.user_id == user_id,
            Submission.exam_id == exam_id,
            Submission.problem_id == problem_id,
            Submission.judge_log == marker,
        )
        .first()
    )
    if existing is not None:
        logger.info(f"[skip] 合成 submission 已存在 id={existing.id}")
        return

    testcases = (
        db.query(TestCase)
        .filter(TestCase.problem_id == problem_id)
        .order_by(TestCase.id.asc())
        .limit(2)
        .all()
    )
    if len(testcases) < 1:
        logger.info(f"[skip] problem_id={problem_id} 沒有 TestCase，不造合成 submission")
        return

    submission = Submission(
        user_id=user_id,
        problem_id=problem_id,
        exam_id=exam_id,
        submission_type="OFFICIAL",
        language="python",
        code_s3_url="s3://octest-submissions/synthetic-e2e.py",
        status=JudgeStatus.WA,
        score=50,
        execution_time=120,
        memory_usage=12,
        judge_log=marker,
    )
    db.add(submission)
    db.flush()

    # 兩筆 SubmissionDetail：一筆 sample WA（runtime_info 給 candidate 對照）+ 一筆 hidden AC。
    # PR #59 後 candidate 看 hidden testcase runtime_info 會被 mask 成 null；
    # 所以這條為了 E2 spec demo「考生看得到 WA 對比」、WA 要放在 sample testcase 上。
    details_seed = [
        {
            "testcase_id": testcases[0].id,           # sample
            "status": JudgeStatus.WA,
            "execution_time": 18,
            "memory_usage": 11,
            "score": 0,
            "runtime_info": "Expected: 7\nGot: 6",
        },
        {
            "testcase_id": testcases[-1].id,          # hidden（若只有 1 筆 TestCase 會與上面同 id）
            "status": JudgeStatus.AC,
            "execution_time": 23,
            "memory_usage": 10,
            "score": 50,
            "runtime_info": "",
        },
    ]
    for d in details_seed:
        db.add(SubmissionDetail(submission_id=submission.id, **d))

    db.commit()
    logger.info(f"[建立] 合成 submission id={submission.id}  with {len(details_seed)} details")


def seed(db: Session) -> None:
    demo_candidate = _get_required_user(db, DEMO_CANDIDATE_USERNAME)
    other_candidate = _get_required_user(db, OTHER_CANDIDATE_USERNAME)
    questioner = _get_any_questioner(db)
    problem = _get_or_create_demo_problem(db, questioner.id)

    now = datetime.now(timezone.utc)

    # Demo 種子考試：happy path 測試專用
    _upsert_exam(
        db,
        title="Demo Exam (happy path)",
        creator_id=questioner.id,
        candidate_id=demo_candidate.id,
        status=ExamStatus.Ongoing,
        duration_minutes=120,
        start_time=now - timedelta(seconds=5),
        end_time=None,
        problem_id=problem.id,
    )

    # C3 / D1 — 普通進行中考試（每次 reset start_time，duration 留 60 分鐘充裕）
    _upsert_exam(
        db,
        title="E2E 進行中考試",
        creator_id=questioner.id,
        candidate_id=demo_candidate.id,
        status=ExamStatus.Ongoing,
        duration_minutes=60,
        start_time=now - timedelta(seconds=5),
        end_time=None,
        problem_id=problem.id,
    )

    # B3 反 / D5 / E2 — 已結束的考試（E2 spec 用這張 + 合成 submission 來看 testcase 表）
    ended_exam = _upsert_exam(
        db,
        title="E2E 已結束考試",
        creator_id=questioner.id,
        candidate_id=demo_candidate.id,
        status=ExamStatus.Finished,
        duration_minutes=60,
        start_time=now - timedelta(hours=2),
        end_time=now - timedelta(hours=1),
        problem_id=problem.id,
    )
    _ensure_synthetic_submission(
        db,
        user_id=demo_candidate.id,
        exam_id=ended_exam.id,
        problem_id=problem.id,
    )

    # C1 反 — 別人的考試
    _upsert_exam(
        db,
        title="E2E 別人的考試",
        creator_id=questioner.id,
        candidate_id=other_candidate.id,
        status=ExamStatus.Ongoing,
        duration_minutes=120,
        start_time=now - timedelta(minutes=5),
        end_time=None,
        problem_id=problem.id,
    )

    # D4 — 倒數即將歸零；start_time 設成 (duration - TIMEOUT_REMAINING_SECONDS) 秒前。
    duration_minutes = 5
    elapsed = duration_minutes * 60 - TIMEOUT_REMAINING_SECONDS
    _upsert_exam(
        db,
        title="E2E 倒數歸零",
        creator_id=questioner.id,
        candidate_id=demo_candidate.id,
        status=ExamStatus.Ongoing,
        duration_minutes=duration_minutes,
        start_time=now - timedelta(seconds=elapsed),
        end_time=None,
        problem_id=problem.id,
    )


if __name__ == "__main__":
    db = SessionLocal()
    try:
        seed(db)
        logger.info("seed 完成。")
    finally:
        db.close()
