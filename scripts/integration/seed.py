"""
Seed 整合測試需要的最小資料集。

在 backend container 內執行：
    docker exec online-code-test-backend-1 python /app/scripts/integration/seed.py

冪等：重跑會跳過已存在的資料。
"""
import sys
from datetime import datetime, timezone, timedelta

sys.path.insert(0, "/app")

from app.db.session import SessionLocal
from app.models.user import User
from app.models.problem import Problem
from app.models.testcase import TestCase
from app.models.exam import Exam, ExamProblem
from app.models.enums import UserRole, DifficultyLevel, ExamStatus
from app.core.security import SecurityManager


CANDIDATE_USERNAME = "demo_candidate"
QUESTIONER_USERNAME = "demo_questioner"
DEFAULT_PASSWORD = "password123"


def get_or_create_user(db, username: str, role: UserRole) -> User:
    existing = db.query(User).filter(User.username == username).first()
    if existing:
        print(f"  user '{username}' already exists ({existing.id})")
        return existing
    user = User(
        username=username,
        full_name=username,
        password_hash=SecurityManager.hash_password(DEFAULT_PASSWORD),
        role=role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    print(f"  created user '{username}' ({user.id})")
    return user


def get_or_create_problem(db, creator_id) -> Problem:
    existing = db.query(Problem).filter(Problem.title == "兩數相加 (demo)").first()
    if existing:
        print(f"  problem 'sum-two' already exists (id={existing.id})")
        return existing
    problem = Problem(
        creator_id=creator_id,
        title="兩數相加 (demo)",
        description=(
            "讀取一行兩個以空白分隔的整數 a b，輸出 a+b。\n"
            "例如：輸入 `3 5`，輸出 `8`。"
        ),
        difficulty=DifficultyLevel.Easy,
        time_limit=1000,
        memory_limit=128,
    )
    db.add(problem)
    db.commit()
    db.refresh(problem)

    tcs = [
        TestCase(problem_id=problem.id, input_data="3 5\n", expected_output="8\n", is_sample=True, score_weight=50),
        TestCase(problem_id=problem.id, input_data="100 200\n", expected_output="300\n", is_sample=False, score_weight=50),
    ]
    for tc in tcs:
        db.add(tc)
    db.commit()
    print(f"  created problem 'sum-two' (id={problem.id}) with 2 testcases")
    return problem


def get_or_create_exam(db, creator_id, candidate_id, problem_id) -> Exam:
    existing = db.query(Exam).filter(
        Exam.candidate_id == candidate_id,
        Exam.title == "Demo Exam (happy path)"
    ).first()
    if existing:
        print(f"  exam already exists ({existing.id}, status={existing.status.value})")
        if existing.status != ExamStatus.Ongoing:
            existing.status = ExamStatus.Ongoing
            existing.start_time = datetime.now(timezone.utc)
            existing.end_time = datetime.now(timezone.utc) + timedelta(hours=2)
            db.commit()
            print(f"  reset exam to Ongoing")
        return existing

    now = datetime.now(timezone.utc)
    exam = Exam(
        title="Demo Exam (happy path)",
        creator_id=creator_id,
        candidate_id=candidate_id,
        duration_minutes=120,
        start_time=now,
        end_time=now + timedelta(hours=2),
        status=ExamStatus.Ongoing,
        easy_count=1, medium_count=0, hard_count=0,
    )
    db.add(exam)
    db.commit()
    db.refresh(exam)

    link = ExamProblem(exam_id=exam.id, problem_id=problem_id, sequence=1, points=100)
    db.add(link)
    db.commit()
    print(f"  created exam ({exam.id}) linked to problem {problem_id}")
    return exam


def main():
    db = SessionLocal()
    try:
        print("[seed] users")
        questioner = get_or_create_user(db, QUESTIONER_USERNAME, UserRole.Questioner)
        candidate = get_or_create_user(db, CANDIDATE_USERNAME, UserRole.Candidate)

        print("[seed] problem + testcases")
        problem = get_or_create_problem(db, questioner.id)

        print("[seed] exam")
        exam = get_or_create_exam(db, questioner.id, candidate.id, problem.id)

        print()
        print("=" * 60)
        print("Seed complete. Use these in happy_path.py:")
        print(f"  CANDIDATE_USERNAME = {CANDIDATE_USERNAME!r}")
        print(f"  CANDIDATE_PASSWORD = {DEFAULT_PASSWORD!r}")
        print(f"  PROBLEM_ID         = {problem.id}")
        print(f"  EXAM_ID            = {exam.id!r}")
        print("=" * 60)
    finally:
        db.close()


if __name__ == "__main__":
    main()
