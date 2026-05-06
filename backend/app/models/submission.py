from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
import datetime
from datetime import UTC
import uuid
from app.database import Base

class Submission(Base):
    """Submission (提交)：記錄使用者提交的程式碼與評測結果。
    
    - id (PK): UUID。
    - user_id (FK): UUID，誰提交的。
    - problem_id (FK): Integer，考哪一題。
    - language: String，使用的語言 (Python, C++)。
    - code_s3_url: String，程式碼備份在 S3 的路徑。
    - status: Enum (Pending / Judging / AC / WA / TLE / MLE / RE / CE)。
    - execution_time: Integer，實際執行的耗時。
    - memory_usage: Integer，實際記憶體消耗。
    - judge_log: Text，存放詳細的錯誤訊息 (Stderr)。
    - created_at: DateTime，提交時間。
    """
    __tablename__ = "submissions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"))
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