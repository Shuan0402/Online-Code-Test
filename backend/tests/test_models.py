import pytest
import uuid
from app.models import User, Problem, TestCase, Submission, Exam, ExamProblem
from app.models.enums import UserRole, DifficultyLevel, ExamStatus, JudgeStatus
from sqlalchemy.exc import IntegrityError

def test_create_user(db_session):
    """
    測試建立使用者，驗證 GUID (UUID) 與 Enum 是否正確轉換。
    """
    new_user = User(
        username="test_student",
        full_name="測試考生",
        password_hash="hashed_password",
        role=UserRole.Candidate
    )
    
    db_session.add(new_user)
    db_session.commit()

    assert new_user.username == "test_student"
    assert isinstance(new_user.id, uuid.UUID)
    assert new_user.role == UserRole.Candidate

def test_problem_with_test_cases(db_session):
    """
    測試建立題目、難度 Enum 與透過 relationship 添加具備分數權重的測資。
    """
    admin = User(
        username="admin_user",
        password_hash="hash",
        role=UserRole.Admin
    )
    db_session.add(admin)
    db_session.commit()

    new_problem = Problem(
        title="Two Sum",
        description="找出兩數之和",
        difficulty=DifficultyLevel.Easy,
        creator_id=admin.id
    )
    new_problem.test_cases.append(
        TestCase(input_data="1 2", expected_output="3", score_weight=50)
    )
    new_problem.test_cases.append(
        TestCase(input_data="5 5", expected_output="10", score_weight=50)
    )
    db_session.add(new_problem)
    db_session.commit()

    assert len(new_problem.test_cases) == 2
    assert sum(tc.score_weight for tc in new_problem.test_cases) == 100
    assert new_problem.difficulty == DifficultyLevel.Easy

def test_exam_creation_with_dual_users(db_session):
    """
    測試 Exam 實體中「主考官」與「考生」的雙重外鍵關係。
    """
    admin = User(
        username="admin", 
        password_hash="123", 
        role=UserRole.Admin
    )
    student = User(
        username="student", 
        password_hash="456", 
        role=UserRole.Candidate
    )
    db_session.add_all([admin, student])
    db_session.commit()

    new_exam = Exam(
        title="2026 後端實作測驗",
        creator_id=admin.id,
        candidate_id=student.id,
        duration_minutes=60,
        status=ExamStatus.Published,
        easy_count=2
    )
    db_session.add(new_exam)
    db_session.commit()

    assert new_exam.creator.username == "admin"
    assert new_exam.candidate.username == "student"
    assert len(admin.managed_exams) == 1
    assert len(student.assigned_exams) == 1

def test_exam_problem_composite_pk_and_snapshot(db_session):
    """
    測試 ExamProblem 中間表：複合主鍵與分數快照功能。
    """
    admin = User(
        username="admin", 
        password_hash="pw", 
        role=UserRole.Admin
    )
    db_session.add(admin)
    db_session.commit()

    prob = Problem(
        title="SQL Test",
        description="...", 
        difficulty=DifficultyLevel.Medium,
        creator_id=admin.id
    )
    exam = Exam(
        title="Midterm", 
        creator_id=admin.id, 
        candidate_id=uuid.uuid4()
    )
    db_session.add_all([prob, exam])
    db_session.commit()

    ep = ExamProblem(
        exam_id=exam.id,
        problem_id=prob.id,
        sequence=1,
        points=50 
    )
    db_session.add(ep)
    db_session.commit()

    retrieved_ep = db_session.query(ExamProblem).filter_by(
        exam_id=exam.id, 
        problem_id=prob.id
    ).first()
    
    assert retrieved_ep.points == 50
    assert retrieved_ep.problem.title == "SQL Test"

def test_submission_full_relations(db_session):
    """
    測試提交紀錄是否能正確關聯 User, Problem 與 Exam。
    """
    admin = User(
        username="admin",
        password_hash="...", 
        role=UserRole.Admin
    )
    u = User(
        username="user",
        password_hash="...", 
        role=UserRole.Candidate
    )
    db_session.add_all([admin, u])
    db_session.flush()

    p = Problem(
        title="P1",
        description="...",
        difficulty=DifficultyLevel.Easy,
        creator=admin
    )
    e = Exam(
        title="E1", 
        creator=admin,
        candidate=u
    )
    db_session.add_all([p, e])
    db_session.commit()

    sub = Submission(
        user=u,
        problem=p,
        exam=e,
        language="python",
        status=JudgeStatus.Pending,
        code_s3_url="s3://bucket/code.py"
    )
    db_session.add(sub)
    db_session.commit()

    assert sub.exam.title == "E1"
    assert sub.user.username == "user"
    assert sub.problem.title == "P1"
    assert sub.status == JudgeStatus.Pending

def test_unique_username(db_session):
    """
    測試 username 的唯一性約束。
    """
    user1 = User(
        username="duplicate", 
        password_hash="hash1"
        )
    db_session.add(user1)
    db_session.commit()

    user2 = User(
        username="duplicate", 
        password_hash="hash2"
    )
    db_session.add(user2)
    
    with pytest.raises(IntegrityError):
        db_session.commit()

def test_cascade_delete_problem_testcases(db_session):
    """
    驗證刪除題目時，對應的測試案例是否自動刪除。
    """
    admin = User(
        username="admin", 
        password_hash="...", 
        role=UserRole.Admin
    )
    db_session.add(admin)
    db_session.commit()

    prob = Problem(
        title="Delete Me", 
        description="...", 
        creator=admin, 
        difficulty=DifficultyLevel.Easy
    )
    prob.test_cases.append(TestCase(input_data="in", expected_output="out"))
    db_session.add(prob)
    db_session.commit()

    prob_id = prob.id
    db_session.delete(prob)
    db_session.commit()

    remaining_cases = db_session.query(TestCase).filter_by(problem_id=prob_id).all()
    assert len(remaining_cases) == 0

def test_exam_defaults(db_session):
    """
    驗證 Exam 建立時的預設值（狀態、得分、題數）。
    """
    exam = Exam(
        title="Default Test", 
        creator_id=uuid.uuid4(), 
        candidate_id=uuid.uuid4()
    )
    db_session.add(exam)
    db_session.commit()
    db_session.refresh(exam)

    assert exam.status == ExamStatus.Draft
    assert exam.score == 0
    assert exam.easy_count == 0
    assert exam.created_at is not None

def test_user_submissions_relationship(db_session):
    """
    測試從 User 實體導航至 Submission 列表。
    """
    u = User(
        username="nav_user",
        password_hash="..."
    )
    p = Problem(
        title="P", 
        description="...", 
        creator_id=uuid.uuid4(), 
        difficulty=DifficultyLevel.Easy
    )
    db_session.add_all([u, p])
    db_session.commit()

    sub1 = Submission(
        user=u, 
        problem=p, 
        language="py", 
        code_s3_url="s1")
    sub2 = Submission(
        user=u, 
        problem=p, 
        language="cpp", 
        code_s3_url="s2")
    db_session.add_all([sub1, sub2])
    db_session.commit()

    assert len(u.submissions) == 2
    assert u.submissions[0].language in ["py", "cpp"]