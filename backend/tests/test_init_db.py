import pytest
import json
from pathlib import Path
import tempfile
from sqlalchemy.orm import Session
from unittest.mock import patch

from app.db.init_db import seed_users, seed_problems, init_development_data
from app.models.user import User, UserRole
from app.models.problem import Problem
from app.models.testcase import TestCase


@pytest.fixture
def temp_seed_dir():
    """Create a temporary seed directory with test data."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        # Create test users seed file
        users_data = [
            {
                "username": "test_admin",
                "full_name": "Test Admin",
                "password": "test_password",
                "role": "Admin"
            },
            {
                "username": "test_questioner",
                "full_name": "Test Questioner",
                "password": "test_password",
                "role": "Questioner"
            },
            {
                "username": "test_candidate",
                "full_name": "Test Candidate",
                "password": "test_password",
                "role": "Candidate"
            }
        ]
        users_file = tmpdir_path / "users.json"
        with open(users_file, "w", encoding="utf-8") as f:
            json.dump(users_data, f, ensure_ascii=False)
        
        # Create test problems seed file
        problems_data = [
            {
                "title": "Test Problem 1",
                "description": "A simple test problem.",
                "difficulty": "Easy",
                "time_limit_ms": 1000,
                "memory_limit_mb": 128,
                "testcases": [
                    {
                        "input_data": "1 2",
                        "expected_output": "3",
                        "is_sample": True,
                        "score_weight": 50
                    },
                    {
                        "input_data": "5 7",
                        "expected_output": "12",
                        "is_sample": False,
                        "score_weight": 50
                    }
                ]
            },
            {
                "title": "Test Problem 2",
                "description": "Another test problem.",
                "difficulty": "Medium",
                "time_limit_ms": 2000,
                "memory_limit_mb": 256,
                "testcases": [
                    {
                        "input_data": "hello",
                        "expected_output": "olleh",
                        "is_sample": True,
                        "score_weight": 100
                    }
                ]
            }
        ]
        problems_file = tmpdir_path / "problems.json"
        with open(problems_file, "w", encoding="utf-8") as f:
            json.dump(problems_data, f, ensure_ascii=False)
        
        yield tmpdir_path


def test_seed_users_creates_users(db_session: Session, temp_seed_dir: Path, monkeypatch):
    """Test that seed_users correctly creates users from seed file."""
    # Mock SEED_DIR to point to our temp directory
    from app.db import init_db
    monkeypatch.setattr(init_db, "SEED_DIR", temp_seed_dir)
    
    # Seed users
    seed_users(db_session)
    
    # Verify users were created
    test_admin = db_session.query(User).filter_by(username="test_admin").first()
    assert test_admin is not None
    assert test_admin.full_name == "Test Admin"
    assert test_admin.role == UserRole.Admin
    assert test_admin.is_active is True
    
    test_questioner = db_session.query(User).filter_by(username="test_questioner").first()
    assert test_questioner is not None
    assert test_questioner.role == UserRole.Questioner
    
    test_candidate = db_session.query(User).filter_by(username="test_candidate").first()
    assert test_candidate is not None
    assert test_candidate.role == UserRole.Candidate


def test_seed_users_idempotent(db_session: Session, temp_seed_dir: Path, monkeypatch):
    """Test that seed_users is idempotent (multiple calls don't create duplicates)."""
    from app.db import init_db
    monkeypatch.setattr(init_db, "SEED_DIR", temp_seed_dir)
    
    # Seed twice
    seed_users(db_session)
    initial_count = db_session.query(User).filter_by(username="test_admin").count()
    assert initial_count == 1
    
    seed_users(db_session)
    final_count = db_session.query(User).filter_by(username="test_admin").count()
    assert final_count == 1, "Calling seed_users twice should not create duplicates"


def test_seed_users_password_hashed(db_session: Session, temp_seed_dir: Path, monkeypatch):
    """Test that user passwords are hashed before storage."""
    from app.db import init_db
    from app.core.security import SecurityManager
    monkeypatch.setattr(init_db, "SEED_DIR", temp_seed_dir)
    
    seed_users(db_session)
    
    user = db_session.query(User).filter_by(username="test_admin").first()
    assert user is not None
    assert user.password_hash != "test_password"
    
    # Verify password can be verified correctly
    assert SecurityManager.verify_password("test_password", user.password_hash) is True
    assert SecurityManager.verify_password("wrong_password", user.password_hash) is False


def test_seed_problems_creates_problems(db_session: Session, temp_seed_dir: Path, monkeypatch):
    """Test that seed_problems correctly creates problems with testcases."""
    from app.db import init_db
    monkeypatch.setattr(init_db, "SEED_DIR", temp_seed_dir)
    
    # First seed a questioner user
    seed_users(db_session)
    
    # Then seed problems
    seed_problems(db_session)
    
    # Verify problems were created
    problem1 = db_session.query(Problem).filter_by(title="Test Problem 1").first()
    assert problem1 is not None
    assert problem1.description == "A simple test problem."
    assert problem1.difficulty == "Easy"
    assert problem1.time_limit_ms == 1000
    assert problem1.memory_limit_mb == 128
    assert problem1.is_deleted is False
    
    problem2 = db_session.query(Problem).filter_by(title="Test Problem 2").first()
    assert problem2 is not None
    assert problem2.difficulty == "Medium"


def test_seed_problems_creates_testcases(db_session: Session, temp_seed_dir: Path, monkeypatch):
    """Test that seed_problems correctly creates testcases for each problem."""
    from app.db import init_db
    monkeypatch.setattr(init_db, "SEED_DIR", temp_seed_dir)
    
    seed_users(db_session)
    seed_problems(db_session)
    
    # Get the first problem and its testcases
    problem1 = db_session.query(Problem).filter_by(title="Test Problem 1").first()
    assert problem1 is not None
    
    testcases = db_session.query(TestCase).filter_by(problem_id=problem1.id).all()
    assert len(testcases) == 2
    
    # Verify testcase data
    sample_tc = next((tc for tc in testcases if tc.is_sample), None)
    assert sample_tc is not None
    assert sample_tc.input_data == "1 2"
    assert sample_tc.expected_output == "3"
    assert sample_tc.score_weight == 50
    
    hidden_tc = next((tc for tc in testcases if not tc.is_sample), None)
    assert hidden_tc is not None
    assert hidden_tc.score_weight == 50


def test_seed_problems_idempotent(db_session: Session, temp_seed_dir: Path, monkeypatch):
    """Test that seed_problems is idempotent."""
    from app.db import init_db
    monkeypatch.setattr(init_db, "SEED_DIR", temp_seed_dir)
    
    seed_users(db_session)
    seed_problems(db_session)
    
    initial_count = db_session.query(Problem).filter_by(title="Test Problem 1").count()
    assert initial_count == 1
    
    seed_problems(db_session)
    final_count = db_session.query(Problem).filter_by(title="Test Problem 1").count()
    assert final_count == 1, "Calling seed_problems twice should not create duplicates"


def test_seed_problems_skips_without_questioner(db_session: Session, temp_seed_dir: Path, monkeypatch):
    """Test that seed_problems gracefully handles missing questioner."""
    from app.db import init_db
    monkeypatch.setattr(init_db, "SEED_DIR", temp_seed_dir)
    
    # Don't seed users, so no questioner exists
    # seed_problems should skip gracefully
    seed_problems(db_session)
    
    # No problems should be created
    problems = db_session.query(Problem).all()
    assert len(problems) == 0


def test_seed_problems_uses_questioner_as_creator(db_session: Session, temp_seed_dir: Path, monkeypatch):
    """Test that seed_problems binds problems to the questioner user."""
    from app.db import init_db
    monkeypatch.setattr(init_db, "SEED_DIR", temp_seed_dir)
    
    seed_users(db_session)
    questioner = db_session.query(User).filter_by(username="test_questioner").first()
    
    seed_problems(db_session)
    
    problem = db_session.query(Problem).filter_by(title="Test Problem 1").first()
    assert problem is not None
    assert problem.creator_id == questioner.id


def test_init_development_data_full_flow(db_session: Session, temp_seed_dir: Path, monkeypatch, setup_db):
    """Test the full init_development_data flow."""
    from app.db import init_db
    monkeypatch.setattr(init_db, "SEED_DIR", temp_seed_dir)
    
    # Call the main init function with test engine
    init_development_data(db_session, bind_engine=setup_db)
    
    # Verify both users and problems were created
    users_count = db_session.query(User).count()
    problems_count = db_session.query(Problem).count()
    testcases_count = db_session.query(TestCase).count()
    
    assert users_count == 3, "Should have created 3 users"
    assert problems_count == 2, "Should have created 2 problems"
    assert testcases_count == 3, "Should have created 3 testcases total (2 for problem 1, 1 for problem 2)"


def test_seed_users_missing_seed_file(db_session: Session, temp_seed_dir: Path, monkeypatch):
    """Test seed_users when seed file is missing."""
    from app.db import init_db
    # Point to directory without users.json
    monkeypatch.setattr(init_db, "SEED_DIR", temp_seed_dir / "nonexistent")
    
    # Should not raise, just log warning and return
    seed_users(db_session)
    
    users = db_session.query(User).all()
    assert len(users) == 0


def test_seed_problems_missing_seed_file(db_session: Session, temp_seed_dir: Path, monkeypatch):
    """Test seed_problems when seed file is missing."""
    from app.db import init_db
    # Point to directory without problems.json
    monkeypatch.setattr(init_db, "SEED_DIR", temp_seed_dir / "nonexistent")
    
    # Should not raise, just log warning and return
    seed_problems(db_session)
    
    problems = db_session.query(Problem).all()
    assert len(problems) == 0


def test_init_development_data_without_explicit_engine(db_session: Session, temp_seed_dir: Path, monkeypatch, setup_db):
    """Test init_development_data without explicit bind_engine (should use global engine mock)."""
    from app.db import init_db
    from unittest.mock import patch
    monkeypatch.setattr(init_db, "SEED_DIR", temp_seed_dir)
    
    # Mock the global engine to avoid PostgreSQL connection
    with patch.object(init_db, "engine", setup_db):
        init_development_data(db_session)
    
    # Verify initialization completed
    users_count = db_session.query(User).count()
    assert users_count == 3


@pytest.fixture
def temp_seed_dir_with_role_fallback():
    """Create a temporary seed directory to test role enum fallback."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        # Create users where role is stored as string key
        users_data = [
            {
                "username": "test_user",
                "full_name": "Test User",
                "password": "test_password",
                "role": "Admin"  # This will work via enum value
            }
        ]
        users_file = tmpdir_path / "users.json"
        with open(users_file, "w", encoding="utf-8") as f:
            json.dump(users_data, f, ensure_ascii=False)
        
        # Create empty problems file
        problems_file = tmpdir_path / "problems.json"
        with open(problems_file, "w", encoding="utf-8") as f:
            json.dump([], f)
        
        yield tmpdir_path


def test_seed_users_with_role_fallback(db_session: Session, temp_seed_dir_with_role_fallback: Path, monkeypatch):
    """Test seed_users role enum conversion fallback."""
    from app.db import init_db
    monkeypatch.setattr(init_db, "SEED_DIR", temp_seed_dir_with_role_fallback)
    
    seed_users(db_session)
    
    user = db_session.query(User).filter_by(username="test_user").first()
    assert user is not None
    assert user.role == UserRole.Admin
