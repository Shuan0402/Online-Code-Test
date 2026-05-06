import pytest
from app.models import User, Problem, TestCase, Submission
from app.schemas.user import UserRole
import uuid


def test_create_user(db_session):
    """
    測試建立使用者，並驗證 UUID 格式。
    """
    new_user = User(
        username="test_student",
        password_hash="hashed_password",
        role=UserRole.CANDIDATE.value
    )
    db_session.add(new_user)
    db_session.commit()

    assert new_user.username == "test_student"
    assert len(new_user.id) == 36 

    try:
        uuid.UUID(new_user.id)
    except ValueError:
        pytest.fail("User ID is not a valid UUID")

def test_problem_with_test_cases(db_session):
    """
    測試建立題目並透過 relationship 添加測資。
    """
    new_problem = Problem(
        title="Two Sum",
        description="Find two numbers",
        difficulty="Easy"
    )

    new_problem.test_cases.append(TestCase(input_data="1 2", expected_output="3"))
    new_problem.test_cases.append(TestCase(input_data="5 5", expected_output="10"))

    db_session.add(new_problem)
    db_session.commit()

    assert len(new_problem.test_cases) == 2
    assert new_problem.test_cases[0].problem_id == new_problem.id

def test_cascade_delete_problem(db_session):
    """
    測試刪除題目時，相關的測資也會被刪除。
    """
    new_problem = Problem(title="Delete Me", description="...")
    new_problem.test_cases.append(TestCase(input_data="in", expected_output="out"))
    
    db_session.add(new_problem)
    db_session.commit()
    
    problem_id = new_problem.id
    db_session.delete(new_problem)
    db_session.commit()

    remaining_cases = db_session.query(TestCase).filter_by(problem_id=problem_id).all()
    assert len(remaining_cases) == 0

def test_create_submission(db_session):
    """
    測試建立提交紀錄，驗證外鍵關聯與 execution_time 的 nullable 屬性。
    """
    user = User(username="coder", password_hash="pw")
    prob = Problem(title="Sum", description="...")
    db_session.add_all([user, prob])
    db_session.commit()

    sub = Submission(
        user_id=user.id,
        problem_id=prob.id,
        language="python",
        status="Pending"
    )
    db_session.add(sub)
    db_session.commit()

    assert sub.id is not None
    assert sub.execution_time is None
    assert sub.user.username == "coder"