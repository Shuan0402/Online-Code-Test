from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.orm import relationship
import datetime
from datetime import UTC
from app.database import Base

class Problem(Base):
    __tablename__ = "problems"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    difficulty = Column(String(50))             # Easy, Medium, Hard
    time_limit = Column(Integer, default=1000)   # 毫秒 (ms)
    memory_limit = Column(Integer, default=256)  # MB
    created_at = Column(DateTime, default=datetime.datetime.now(UTC))

    test_cases = relationship("TestCase", back_populates="problem", cascade="all, delete-orphan")
    submissions = relationship("Submission", back_populates="problem")