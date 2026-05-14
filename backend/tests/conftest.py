import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.db.base import Base
from app.db.session import engine as prod_engine, SQLALCHEMY_DATABASE_URL
from app.api.deps import get_db
from app.models import user, problem, submission, exam, exam_problem, testcase

@pytest.fixture(scope="session")
def setup_db():
    engine = create_engine(SQLALCHEMY_DATABASE_URL)
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def db_session(setup_db):
    engine = setup_db
    connection = engine.connect()
    transaction = connection.begin()
    
    TestingSessionLocal = sessionmaker(bind=connection)
    db = TestingSessionLocal()
    
    try:
        yield db
    finally:
        db.close()
        if transaction.is_active:
            transaction.rollback()
        connection.close()


@pytest.fixture(scope="function")
def client(db_session):
    def _get_test_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _get_test_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()