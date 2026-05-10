import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import Base, engine as prod_engine, DATABASE_URL # 直接從這裡拿 URL
from app.database import get_db
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


@pytest.fixture(scope="function")
def db_session():
    engine = create_engine(DATABASE_URL)
    TestingSessionLocal = sessionmaker(bind=engine)
    Base.metadata.create_all(bind=engine)
    
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)

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