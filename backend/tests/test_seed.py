import os
import sys
import pathlib
import pytest
from unittest.mock import patch, MagicMock
from sqlalchemy.orm import Session

# Load seed.py content
SEED_FILE = None
for path in [
    pathlib.Path(__file__).parent.parent.parent / "scripts" / "integration" / "seed.py",
    pathlib.Path("/app/scripts/integration/seed.py"),
    pathlib.Path("/scripts/integration/seed.py"),
]:
    if path.exists():
        SEED_FILE = path
        break

if not SEED_FILE:
    raise FileNotFoundError("Could not find seed.py in any expected path.")

with open(SEED_FILE, "r", encoding="utf-8") as f:
    SEED_CODE = f.read()


def run_seed_code(db_session: Session, run_main=True, patch_session_local=True):
    # Prepare global namespace for execution
    global_ns = {"__name__": "not_main"}
    code_obj = compile(SEED_CODE, str(SEED_FILE.resolve()), "exec")
    
    # We execute the script to define functions/variables in global_ns
    exec(code_obj, global_ns)
    
    if run_main:
        # We patch SessionLocal to return our test db_session
        mock_session_local = MagicMock(return_value=db_session)
        if patch_session_local:
            with patch.dict(global_ns, {"SessionLocal": mock_session_local}):
                global_ns["main"]()
        else:
            global_ns["main"]()
            
    return global_ns

def test_seed_main_empty_db(db_session: Session):
    # This should trigger all creation paths (User, Problem, Exam)
    global_ns = run_seed_code(db_session, run_main=True)
    
    # Verify User creation
    from app.models.user import User
    users = db_session.query(User).all()
    assert len(users) == 2
    assert any(u.username == "demo_candidate" for u in users)
    assert any(u.username == "demo_questioner" for u in users)
    
    # Verify Problem creation
    from app.models.problem import Problem
    problem = db_session.query(Problem).filter_by(title="兩數相加 (demo)").first()
    assert problem is not None
    
    # Verify TestCase creation
    from app.models.testcase import TestCase
    testcases = db_session.query(TestCase).filter_by(problem_id=problem.id).all()
    assert len(testcases) == 2
    
    # Verify Exam creation
    from app.models.exam import Exam
    exam = db_session.query(Exam).filter_by(title="Demo Exam (happy path)").first()
    assert exam is not None
    assert exam.status.value == "Ongoing"

def test_seed_main_already_exists(db_session: Session):
    # Run first time to seed
    run_seed_code(db_session, run_main=True)
    
    # Run second time to verify idempotency and existing check logs
    run_seed_code(db_session, run_main=True)
    
    # Verify count is still same
    from app.models.user import User
    assert db_session.query(User).count() == 2

def test_seed_exam_reset_status(db_session: Session):
    # Create the user and problem first
    global_ns = run_seed_code(db_session, run_main=False)
    
    from app.models.enums import UserRole, ExamStatus
    questioner = global_ns["get_or_create_user"](db_session, "demo_questioner", UserRole.Questioner)
    candidate = global_ns["get_or_create_user"](db_session, "demo_candidate", UserRole.Candidate)
    problem = global_ns["get_or_create_problem"](db_session, questioner.id)
    
    # Manually create an exam with status Draft
    from app.models.exam import Exam
    from datetime import datetime, timezone
    exam = Exam(
        title="Demo Exam (happy path)",
        creator_id=questioner.id,
        candidate_id=candidate.id,
        duration_minutes=120,
        start_time=datetime.now(timezone.utc),
        end_time=datetime.now(timezone.utc),
        status=ExamStatus.Draft,
        easy_count=1, medium_count=0, hard_count=0,
    )
    db_session.add(exam)
    db_session.commit()
    
    # Call get_or_create_exam
    returned_exam = global_ns["get_or_create_exam"](db_session, questioner.id, candidate.id, problem.id)
    
    # Status should be updated to Ongoing
    assert returned_exam.id == exam.id
    assert returned_exam.status == ExamStatus.Ongoing

def test_seed_run_as_main(db_session: Session):
    global_ns = {
        "__name__": "__main__",
    }
    # We patch SessionLocal inside app.db.session before compiling/executing
    # so that when the script imports SessionLocal, it gets our mocked SessionLocal
    mock_session_local = MagicMock(return_value=db_session)
    
    with patch("app.db.session.SessionLocal", mock_session_local):
        code_obj = compile(SEED_CODE, str(SEED_FILE.resolve()), "exec")
        exec(code_obj, global_ns)
        
    # Verify seeding happened successfully
    from app.models.user import User
    users = db_session.query(User).all()
    assert len(users) == 2
