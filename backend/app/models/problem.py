from sqlalchemy import Column, Integer, String, Text, DateTime, Enum, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy import UUID
from app.db.base import Base
from app.models.enums import DifficultyLevel

class Problem(Base):
    """
    Problem (題目)：存放測驗題目內容與限制。

    - id (PK): Integer，題目編號。
    - title: String，題目名稱。
    - creator_id(FK):UUID，出題者編號。
    - description: Text，題目敘述。
    - difficulty: Enum (Easy / Medium / Hard)。
    - time_limit_ms: Integer，執行時間上限（ms）。
    - memory_limit_mb: Integer，記憶體使用上限（MB）。
    - created_at: DateTime，建立時間。
    """
    __tablename__ = "problems"

    # 欄位定義
    id = Column(Integer, primary_key=True, index=True)
    creator_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=False)

    title = Column(String(255), nullable=False, unique=True)
    description = Column(Text, nullable=False)
    difficulty = Column(Enum(DifficultyLevel), nullable=False)

    time_limit_ms = Column(Integer, default=1000)   # 毫秒 (ms)
    memory_limit_mb = Column(Integer, default=256)  # MB

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False)

    # 關聯定義
    test_cases = relationship("TestCase", back_populates="problem", cascade="all, delete-orphan")
    submissions = relationship("Submission", back_populates="problem")
    exam_links = relationship("ExamProblem", back_populates="problem")
    questioner = relationship("User", back_populates="created_problems")
