# backend/tests/test_models.py
from app.models import Problem, TestCase

def test_create_problem_with_test_cases(db_session):
    # 現在 db_session 會由 conftest.py 自動注入
    new_problem = Problem(title="Test", description="Desc")
    db_session.add(new_problem)
    db_session.commit()

    assert new_problem.id is not None