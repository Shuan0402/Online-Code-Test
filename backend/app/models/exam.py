# backend/app/models/exam.py

import uuid
from sqlalchemy import Column, Integer, String, DateTime, Enum, ForeignKey, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base
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
    - created_at: DateTime，考試建立時間。
    """
    __tablename__ = "exams"

    # 欄位定義
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(255), nullable=False)
    
    creator_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    candidate_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    duration_minutes = Column(Integer, default=60, nullable=False)
    start_time = Column(DateTime(timezone=True), nullable=True)
    end_time = Column(DateTime(timezone=True), nullable=True)
    
    status = Column(Enum(ExamStatus), default=ExamStatus.Draft, nullable=False)
    score = Column(Integer, default=0)

    easy_count = Column(Integer, default=0, nullable=False)
    medium_count = Column(Integer, default=0, nullable=False)
    hard_count = Column(Integer, default=0, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # 關聯定義
    interviewer = relationship("User", foreign_keys=[creator_id], back_populates="managed_exams")
    candidate = relationship("User", foreign_keys=[candidate_id], back_populates="assigned_exams")
    exam_problems = relationship("ExamProblem", back_populates="exam", cascade="all, delete-orphan")
    submissions = relationship("Submission", back_populates="exam")


class ExamProblem(Base):
    """
    ExamProblem (考試與題目的關聯表)：多對多 (Many-to-Many) 的中間表。

    - Composite(PK): (exam_id, problem_id)，防止同一場考試出現重複的同一題。
    - exam_id (FK)：UUID，考試編號。
    - problem_id (FK)：Integer，題目編號。
    - sequence: Integer，題目序號。
    - points: Integer，當前題目總分，避免之後調分導致歷史成績更動。
    """
    __tablename__ = "exam_problems"

    # 欄位定義
    exam_id = Column(UUID(as_uuid=True), ForeignKey("exams.id", ondelete="CASCADE"), primary_key=True)
    problem_id = Column(Integer, ForeignKey("problems.id", ondelete="CASCADE"), primary_key=True)
    
    sequence = Column(Integer, nullable=False, default=1)
    points = Column(Integer, nullable=False, default=0)

    # 關聯定義
    exam = relationship("Exam", back_populates="exam_problems")
    problem = relationship("Problem", back_populates="exam_links")

    @property
    def title(self) -> str:
        """自動向上代理真實題目的名稱"""
        return self.problem.title if self.problem else "Unknown Problem"

    @property
    def difficulty(self):
        """自動向上代理真實題目的難易度"""
        return self.problem.difficulty if self.problem else None