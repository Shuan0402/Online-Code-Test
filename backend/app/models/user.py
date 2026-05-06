from sqlalchemy import Column, Integer, String, DateTime, Enum
import datetime
from datetime import UTC
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="candidate")
    created_at = Column(DateTime, default=datetime.datetime.now(UTC))