from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.orm import relationship
import datetime
from datetime import UTC
from app.database import Base

class Problem(Base):
    """
    Problem (題目)：存放測驗題目內容與限制。

    - id (PK): Integer。
    - title: String，題目名稱。
    - description: Text，題目敘述。
    - difficulty: Enum (Easy / Medium / Hard)。
    - time_limit: Integer，執行時間上限（ms）。
    - memory_limit: Integer，記憶體使用上限（MB）。
    - created_at: DateTime，題目建立時間。
    """
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