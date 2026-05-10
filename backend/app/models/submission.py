import uuid
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy import UUID
from app.database import Base
from app.models.enums import JudgeStatus


class Submission(Base):
    """Submission (提交)：記錄使用者提交的程式碼與評測結果。
    
    - id (PK): UUID，提交編號。
    - user_id (FK): UUID，誰提交的。
    - problem_id (FK): Integer，考哪一題。
    - exam_id (FK, Nullable): 指向 Exam.id。
    - score: Integer，此次提交總分。
    - language: String，使用的語言 (Python, C++)。
    - code_s3_url: String，程式碼備份在 S3 的路徑。
    - created_at: DateTime，提交時間。
    - status: Enum (Pending / Judging / AC / WA / TLE / MLE / RE / CE)。
    - execution_time: Integer，實際執行的耗時。
    - memory_usage: Integer，實際記憶體消耗。
    - judge_log: Text，存放詳細的錯誤訊息 (Stderr)。
    """
    __tablename__ = "submissions"

    # 定義欄位
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    problem_id = Column(Integer, ForeignKey("problems.id", ondelete="CASCADE"), nullable=False)
    
    exam_id = Column(UUID(as_uuid=True), ForeignKey("exams.id", ondelete="SET NULL"), nullable=True)

    language = Column(String(50), nullable=False)
    code_s3_url = Column(String(500), nullable=False)
    
    status = Column(Enum(JudgeStatus), default=JudgeStatus.Pending, nullable=False)
    score = Column(Integer, default=0)
    execution_time = Column(Integer, nullable=True)
    memory_usage = Column(Integer, nullable=True)
    judge_log = Column(Text, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # 定義關聯
    user = relationship("User", back_populates="submissions")
    problem = relationship("Problem", back_populates="submissions")
    exam = relationship("Exam", back_populates="submissions")
