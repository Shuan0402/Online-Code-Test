import uuid
from sqlalchemy import Column, Integer, String, DateTime, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import sqlalchemy.types as types
from app.database import Base
from app.models.utils import GUID
from app.models.enums import ExamStatus


class Exam(Base):
    """
    Exam (考試主表)：存放考試的基本資訊與抽題規則。

    - id (PK): UUID，考試編號。
    - title: String，考試名稱。
    - creator_id (FK): UUID，關聯到 User.id (主考官)
    - candidate_id (FK): UUID，指向 User.id (考生)
    - duration_minutes: Integer，考試限時。
    - start_time: DateTime，考生實際開始考試時間。
    - end_time: DateTime，考生實際結束考試時間。
    - status: Enum(Draft, Published, Ongoing, Finished, Archived)，考試執行狀態。
    - easy_count: Integer，簡單題數。
    - medium_count: Integer，中等題數。
    - hard_count: Integer，困難題數。
    - score: Integer，此次考試得分。
    """
    __tablename__ = "exams"

    # 欄位定義
    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    title = Column(String(255), nullable=False)
    
    creator_id = Column(GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    candidate_id = Column(GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    duration_minutes = Column(Integer, default=60, nullable=False)
    start_time = Column(DateTime(timezone=True), nullable=True)
    end_time = Column(DateTime(timezone=True), nullable=True)
    
    status = Column(Enum(ExamStatus), default=ExamStatus.Draft, nullable=False)
    score = Column(Integer, default=0)

    easy_count = Column(Integer, default=0, nullable=False)
    medium_count = Column(Integer, default=0, nullable=False)
    hard_count = Column(Integer, default=0, nullable=False)

    # 關聯定義
    creator = relationship("User", foreign_keys=[creator_id], back_populates="managed_exams")
    candidate = relationship("User", foreign_keys=[candidate_id], back_populates="assigned_exams")
    exam_problems = relationship("ExamProblem", back_populates="exam", cascade="all, delete-orphan")
    submissions = relationship("Submission", back_populates="exam")