"""
Seed fixtures for Questioner L2 regression Playwright tests.

Run inside backend container:
    docker compose exec backend python -m app.scripts.seed_e2e_questioner

Idempotent: lookups by exact title/username so re-running resets state.

Fixtures produced:
- 1 candidate user (e2e_q_candidate@nthu.edu.tw / password123)
- 4 problems exercising judge-worker behaviour for Q-1 / Q-2:
    * E2E-Q-TLE      : time_limit_ms=500,  1 testcase                — Q-1.2 TLE
    * E2E-Q-Partial  : time_limit_ms=2000, 2 testcases (50/50)        — Q-1.3 partial credit
    * E2E-Q-MemBomb  : time_limit_ms=10000, memory_limit_mb=128       — Q-2.1 cgroup memory limit
    * E2E-Q-Network  : time_limit_ms=5000                             — Q-2.2 network blocked
- 1 ongoing exam "E2E Q 沙箱回歸考試" assigned to e2e_q_candidate,
  containing all 4 problems. Status Ongoing so the candidate can POST
  submissions through /api/v1/submissions/ during the test.

Q-1.1 (UI-driven new-problem creation) does NOT need seed — the test
itself creates the problem via the questioner panel and then cross-layer
verifies via scripts/e2e/helpers/verify-problem-testcases.sh.
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
from app.models.testcase import TestCase
from app.models.enums import ExamStatus, DifficultyLevel

logger = logging.getLogger("seed-e2e-questioner")
logging.basicConfig(level=logging.INFO, format="%(message)s")

Q_CANDIDATE_USERNAME = "e2e_q_candidate@nthu.edu.tw"
Q_CANDIDATE_PASSWORD = "password123"
Q_CANDIDATE_FULLNAME = "E2E Q Candidate"

EXAM_TITLE = "E2E Q 沙箱回歸考試"

# Problem specs: (title, difficulty, time_limit_ms, memory_limit_mb, testcases)
# testcase shape: (input_data, expected_output, score_weight, is_sample)
PROBLEM_SPECS = [
    (
        "E2E-Q-TLE",
        DifficultyLevel.Easy,
        500,   # tight time limit — `while True: pass` must hit TLE
        256,
        [("\n", "0\n", 100, True)],
    ),
    (
        "E2E-Q-Partial",
        DifficultyLevel.Easy,
        2000,
        256,
        # constant output `print("hello A")` matches tc1, fails tc2 → score 50
        [
            ("A\n", "hello A\n", 50, True),
            ("B\n", "hello B\n", 50, False),
        ],
    ),
    (
        "E2E-Q-MemBomb",
        DifficultyLevel.Medium,
        10000,
        128,   # cgroup memory cap — 256MB allocation must OOM-kill
        [("\n", "ok\n", 100, True)],
    ),
    (
        "E2E-Q-Network",
        DifficultyLevel.Medium,
        5000,
        256,
        [("\n", "ok\n", 100, True)],
    ),
]


def _get_any_questioner(db: Session) -> User:
    q = db.query(User).filter(User.role == UserRole.Questioner).first()
    if not q:
        sys.exit("DB 沒有任何 Questioner，無法當題目 creator。")
    return q


def _upsert_candidate(db: Session) -> User:
    u = db.query(User).filter(User.username == Q_CANDIDATE_USERNAME).first()
    if u is None:
        u = User(
            username=Q_CANDIDATE_USERNAME,
            full_name=Q_CANDIDATE_FULLNAME,
            password_hash=SecurityManager.hash_password(Q_CANDIDATE_PASSWORD),
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
    db: Session,
    *,
    title: str,
    difficulty: DifficultyLevel,
    time_limit_ms: int,
    memory_limit_mb: int,
    testcases: list[tuple[str, str, int, bool]],
    creator_id,
) -> Problem:
    p = db.query(Problem).filter(Problem.title == title).first()
    if p is None:
        p = Problem(
            title=title,
            creator_id=creator_id,
            description=f"# {title}\n\n（E2E Questioner 種子題目）",
            difficulty=difficulty,
            time_limit_ms=time_limit_ms,
            memory_limit_mb=memory_limit_mb,
        )
        db.add(p)
        db.flush()
        for input_data, expected_output, score_weight, is_sample in testcases:
            db.add(TestCase(
                problem_id=p.id,
                input_data=input_data,
                expected_output=expected_output,
                score_weight=score_weight,
                is_sample=is_sample,
            ))
        db.commit()
        db.refresh(p)
        logger.info(
            f"[建立] problem {p.id}  {p.title}  "
            f"({p.difficulty.value}, {time_limit_ms}ms, {memory_limit_mb}MB, "
            f"{len(testcases)} testcase)"
        )
    else:
        # Reset limits in case the seed spec changed between runs.
        p.time_limit_ms = time_limit_ms
        p.memory_limit_mb = memory_limit_mb
        db.commit()
        logger.info(f"[skip] problem 已存在 id={p.id}  {p.title}  (已重置時間/記憶體上限)")
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
            medium_count=2,
            hard_count=0,
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
        exam.medium_count = 2
        exam.hard_count = 0
        action = "重置"

    points_per = max(1, 100 // len(problem_ids))
    for seq, pid in enumerate(problem_ids, start=1):
        link = (
            db.query(ExamProblem)
            .filter(ExamProblem.exam_id == exam.id, ExamProblem.problem_id == pid)
            .first()
        )
        if link is None:
            db.add(ExamProblem(exam_id=exam.id, problem_id=pid, sequence=seq, points=points_per))
        else:
            link.sequence = seq
            link.points = points_per

    db.commit()
    db.refresh(exam)
    logger.info(f"[{action}] exam {EXAM_TITLE}  id={exam.id}  problems={problem_ids}")
    return exam


def seed(db: Session) -> None:
    questioner = _get_any_questioner(db)
    candidate = _upsert_candidate(db)

    problems = [
        _upsert_problem(
            db,
            title=title,
            difficulty=diff,
            time_limit_ms=tl,
            memory_limit_mb=ml,
            testcases=tcs,
            creator_id=questioner.id,
        )
        for (title, diff, tl, ml, tcs) in PROBLEM_SPECS
    ]

    _upsert_exam(
        db,
        creator_id=questioner.id,
        candidate_id=candidate.id,
        problem_ids=[p.id for p in problems],
    )


if __name__ == "__main__":
    db = SessionLocal()
    try:
        seed(db)
        logger.info("seed 完成。")
    finally:
        db.close()
