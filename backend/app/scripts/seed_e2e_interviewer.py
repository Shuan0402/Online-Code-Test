"""
Seed fixtures for Interviewer L2 regression Playwright tests.

Run inside backend container:
    docker compose exec backend python -m app.scripts.seed_e2e_interviewer

Idempotent: lookups by exact title/username so re-running resets state.

Fixtures produced:
- 1 candidate user (e2e_iv_candidate@nthu.edu.tw / password123)
- 6 problems: Easy x2, Medium x2, Hard x2 (titles E2E-IV-{diff}-{n})
- 1 ongoing exam "E2E IV 進行中考試" assigned to e2e_iv_candidate,
  containing 4 problems (Easy-1, Easy-2, Medium-1, Hard-1). The other 2
  problems (Medium-2, Hard-2) are NOT in the exam — used to test that a
  candidate cannot submit code for an unassigned problem (I-2.3).
  Status must be Ongoing so the submit endpoint reaches the
  "本題目不屬於該場考試的範疇" check (status guard precedes it).
- 3 submissions on that exam by e2e_iv_candidate:
    * Easy-1   : AC + 2 SubmissionDetail rows (for I-3.2 testcase table)
    * Easy-2   : WA + 1 SubmissionDetail row
    * Medium-1 : CE  (compilation error; I-3.3 "Compilation Error" path)
  Hard-1 is intentionally left **unsubmitted** (I-3.3 "此題目無提交紀錄").
"""

import logging
import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.core.security import SecurityManager
from app.models.user import User, UserRole
from app.models.problem import Problem
from app.models.exam import Exam, ExamProblem
from app.models.submission import Submission, SubmissionDetail
from app.models.testcase import TestCase
from app.models.enums import ExamStatus, JudgeStatus, DifficultyLevel

logger = logging.getLogger("seed-e2e-interviewer")
logging.basicConfig(level=logging.INFO, format="%(message)s")

IV_CANDIDATE_USERNAME = "e2e_iv_candidate@nthu.edu.tw"
IV_CANDIDATE_PASSWORD = "password123"
IV_CANDIDATE_FULLNAME = "E2E IV Candidate"

EXAM_TITLE = "E2E IV 進行中考試"

# (title, difficulty) — order matters: indices 0..5 referenced below.
PROBLEM_SPECS = [
    ("E2E-IV-Easy-1",   DifficultyLevel.Easy),
    ("E2E-IV-Easy-2",   DifficultyLevel.Easy),
    ("E2E-IV-Medium-1", DifficultyLevel.Medium),
    ("E2E-IV-Medium-2", DifficultyLevel.Medium),
    ("E2E-IV-Hard-1",   DifficultyLevel.Hard),
    ("E2E-IV-Hard-2",   DifficultyLevel.Hard),
]

# Indices into PROBLEM_SPECS that get attached to the exam.
EXAM_PROBLEM_INDICES = [0, 1, 2, 4]  # Easy-1, Easy-2, Medium-1, Hard-1


def _get_any_questioner(db: Session) -> User:
    q = db.query(User).filter(User.role == UserRole.Questioner).first()
    if not q:
        sys.exit("DB 沒有任何 Questioner，無法當題目 creator。")
    return q


def _upsert_candidate(db: Session) -> User:
    u = db.query(User).filter(User.username == IV_CANDIDATE_USERNAME).first()
    if u is None:
        u = User(
            username=IV_CANDIDATE_USERNAME,
            full_name=IV_CANDIDATE_FULLNAME,
            password_hash=SecurityManager.hash_password(IV_CANDIDATE_PASSWORD),
            role=UserRole.Candidate,
        )
        db.add(u)
        db.commit()
        db.refresh(u)
        logger.info(f"[建立] candidate {u.username}  id={u.id}")
    else:
        logger.info(f"[skip] candidate 已存在 {u.username}  id={u.id}")
    return u


def _upsert_problem(
    db: Session, *, title: str, difficulty: DifficultyLevel, creator_id
) -> Problem:
    p = db.query(Problem).filter(Problem.title == title).first()
    if p is None:
        p = Problem(
            title=title,
            creator_id=creator_id,
            description=f"# {title}\n\n（E2E 種子題目）",
            difficulty=difficulty,
            time_limit_ms=1000,
            memory_limit_mb=256,
        )
        db.add(p)
        db.flush()
        # 給每題 2 筆 testcase，方便 SubmissionDetail 有 testcase_id 可指向
        for i in range(2):
            db.add(TestCase(
                problem_id=p.id,
                input_data=f"{i}\n",
                expected_output=f"{i}\n",
                score_weight=50,
            ))
        db.commit()
        db.refresh(p)
        logger.info(f"[建立] problem {p.id}  {p.title}  ({p.difficulty.value})")
    else:
        logger.info(f"[skip] problem 已存在 id={p.id}  {p.title}")
    return p


def _upsert_exam(
    db: Session,
    *,
    creator_id,
    candidate_id,
    problem_ids: list[int],
) -> Exam:
    now = datetime.now(timezone.utc)
    exam = db.query(Exam).filter(Exam.title == EXAM_TITLE).first()
    if exam is None:
        exam = Exam(
            title=EXAM_TITLE,
            creator_id=creator_id,
            candidate_id=candidate_id,
            duration_minutes=180,
            status=ExamStatus.Ongoing,
            start_time=now - timedelta(minutes=10),
            end_time=None,
            easy_count=2,
            medium_count=1,
            hard_count=1,
        )
        db.add(exam)
        db.flush()
        action = "建立"
    else:
        exam.creator_id = creator_id
        exam.candidate_id = candidate_id
        exam.duration_minutes = 180
        exam.status = ExamStatus.Ongoing
        exam.start_time = now - timedelta(minutes=10)
        exam.end_time = None
        exam.easy_count = 2
        exam.medium_count = 1
        exam.hard_count = 1
        action = "重置"

    # Attach problems (idempotent)
    for seq, pid in enumerate(problem_ids, start=1):
        link = (
            db.query(ExamProblem)
            .filter(ExamProblem.exam_id == exam.id, ExamProblem.problem_id == pid)
            .first()
        )
        if link is None:
            db.add(ExamProblem(exam_id=exam.id, problem_id=pid, sequence=seq, points=25))
        else:
            link.sequence = seq
            link.points = 25

    db.commit()
    db.refresh(exam)
    logger.info(f"[{action}] exam {EXAM_TITLE}  id={exam.id}  problems={problem_ids}")
    return exam


def _upsert_submission(
    db: Session,
    *,
    user_id,
    exam_id,
    problem_id: int,
    status: JudgeStatus,
    score: int,
    judge_log_marker: str,
    details: list[dict] | None = None,
) -> Submission:
    sub = (
        db.query(Submission)
        .filter(
            Submission.user_id == user_id,
            Submission.exam_id == exam_id,
            Submission.problem_id == problem_id,
            Submission.judge_log == judge_log_marker,
        )
        .first()
    )
    if sub is None:
        sub = Submission(
            user_id=user_id,
            problem_id=problem_id,
            exam_id=exam_id,
            submission_type="OFFICIAL",
            language="python",
            code_s3_url="s3://octest-submissions/seed-e2e-iv.py",
            status=status,
            score=score,
            execution_time=42,
            memory_usage=10,
            judge_log=judge_log_marker,
        )
        db.add(sub)
        db.flush()
        if details:
            testcases = (
                db.query(TestCase)
                .filter(TestCase.problem_id == problem_id)
                .order_by(TestCase.id.asc())
                .all()
            )
            for i, d in enumerate(details):
                if i >= len(testcases):
                    break
                db.add(SubmissionDetail(
                    submission_id=sub.id,
                    testcase_id=testcases[i].id,
                    **d,
                ))
        db.commit()
        logger.info(f"[建立] submission id={sub.id}  problem={problem_id}  status={status.value}")
    else:
        logger.info(f"[skip] submission 已存在 id={sub.id}  problem={problem_id}")
    return sub


def seed(db: Session) -> None:
    questioner = _get_any_questioner(db)
    candidate = _upsert_candidate(db)

    problems = [
        _upsert_problem(db, title=t, difficulty=d, creator_id=questioner.id)
        for (t, d) in PROBLEM_SPECS
    ]

    exam_problem_ids = [problems[i].id for i in EXAM_PROBLEM_INDICES]
    exam = _upsert_exam(
        db,
        creator_id=questioner.id,
        candidate_id=candidate.id,
        problem_ids=exam_problem_ids,
    )

    # Easy-1: AC, with 2 SubmissionDetail rows (for I-3.2 testcase table)
    _upsert_submission(
        db,
        user_id=candidate.id,
        exam_id=exam.id,
        problem_id=problems[0].id,
        status=JudgeStatus.AC,
        score=100,
        judge_log_marker="[E2E IV AC]",
        details=[
            {"status": JudgeStatus.AC, "execution_time": 20, "memory_usage": 9,  "score": 50, "runtime_info": ""},
            {"status": JudgeStatus.AC, "execution_time": 22, "memory_usage": 10, "score": 50, "runtime_info": ""},
        ],
    )

    # Easy-2: WA, with 1 detail
    _upsert_submission(
        db,
        user_id=candidate.id,
        exam_id=exam.id,
        problem_id=problems[1].id,
        status=JudgeStatus.WA,
        score=0,
        judge_log_marker="[E2E IV WA]",
        details=[
            {"status": JudgeStatus.WA, "execution_time": 18, "memory_usage": 11, "score": 0, "runtime_info": "Expected: 1\nGot: 0"},
        ],
    )

    # Medium-1: CE (compilation error) — no per-testcase details
    _upsert_submission(
        db,
        user_id=candidate.id,
        exam_id=exam.id,
        problem_id=problems[2].id,
        status=JudgeStatus.CE,
        score=0,
        judge_log_marker="[E2E IV CE]",
        details=None,
    )

    # Hard-1 (problems[4]) intentionally has NO submission — for "此題目無提交紀錄" path.


if __name__ == "__main__":
    db = SessionLocal()
    try:
        seed(db)
        logger.info("seed 完成。")
    finally:
        db.close()
