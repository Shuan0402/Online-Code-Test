from sqlalchemy import Column, Integer, ForeignKey
from sqlalchemy.orm import relationship
from app.db.base import Base
from sqlalchemy import UUID
import uuid


class ExamProblem(Base):
    """
    ExamProblem (考試與題目的關聯表)：多對多 (Many-to-Many) 的中間表。

    - Composite(PK): (ID, ID)，防止同一場考試出現重複的同一題。
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