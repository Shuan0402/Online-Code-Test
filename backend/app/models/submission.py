from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
import datetime
from datetime import UTC
import uuid
from app.database import Base

class Submission(Base):
    __tablename__ = "submissions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(Integer, ForeignKey("users.id"))
    problem_id = Column(Integer, ForeignKey("problems.id"))
    language = Column(String(50))               # python, cpp
    code_s3_url = Column(String(500))
    status = Column(String(50), default="Pending") # AC, WA, TLE, MLE, RE, CE
    execution_time = Column(Integer, nullable=True) # ms
    memory_usage = Column(Integer, nullable=True)   # MB
    judge_log = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.now(UTC))

    user = relationship("User")
    problem = relationship("Problem", back_populates="submissions")