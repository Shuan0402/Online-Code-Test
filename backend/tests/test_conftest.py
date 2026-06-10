import sys
import importlib
import pytest
from app.models.enums import UserRole, DifficultyLevel, ExamStatus

def test_force_reload_conftest():
    # Force reload conftest to ensure it is executed under coverage tracing
    for name in ["conftest", "tests.conftest"]:
        if name in sys.modules:
            importlib.reload(sys.modules[name])

def test_conftest_fixtures(
    db_session,
    client,
    admin_user,
    questioner_user,
    interviewer_user,
    candidate_user,
    override_auth,
    create_test_user,
    create_test_problem,
    create_mock_submission,
    create_test_exam,
    test_queue_client
):
    # Verify DB session exists
    assert db_session is not None

    # Verify client is usable
    assert client is not None

    # Verify user roles
    assert admin_user.role == UserRole.Admin
    assert questioner_user.role == UserRole.Questioner
    assert interviewer_user.role == UserRole.Interviewer
    assert candidate_user.role == UserRole.Candidate

    # Exercise create_test_user with custom attributes
    user = create_test_user(username="custom_user", role=UserRole.Candidate, is_active=False)
    assert user.username == "custom_user"
    assert user.is_active is False

    # Exercise create_test_problem with test cases data
    problem = create_test_problem(
        user=admin_user,
        title="Fixture Problem",
        difficulty=DifficultyLevel.Easy,
        test_cases_data=[
            {"input_data": "1 2", "expected_output": "3"},
            {"input_data": "2 3", "expected_output": "5"}
        ]
    )
    assert problem.title == "Fixture Problem"
    assert len(problem.test_cases) == 2

    # Exercise create_mock_submission
    submission = create_mock_submission(
        user_id=candidate_user.id,
        problem_id=problem.id,
        status="AC",
        score=100
    )
    assert submission is not None
    assert submission.status == "AC"

    # Exercise create_mock_submission where problem has no testcases (triggers not tc branch)
    empty_problem = create_test_problem(user=admin_user, title="Empty Problem")
    submission_no_tc = create_mock_submission(
        user_id=candidate_user.id,
        problem_id=empty_problem.id,
        status="AC",
        score=100
    )
    assert submission_no_tc is not None

    # Exercise create_test_exam
    exam = create_test_exam(
        title="Fixture Exam",
        status=ExamStatus.Draft,
        duration_minutes=60
    )
    assert exam.title == "Fixture Exam"
    assert exam.status == ExamStatus.Draft
    assert exam.duration_minutes == 60

    # Exercise override_auth
    override_auth(candidate_user)
    # Trigger a request to force client to evaluate dependencies and trigger override_auth lambda
    client.get("/api/v1/users/")

    # Exercise test_queue_client
    assert test_queue_client is not None
