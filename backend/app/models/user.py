import uuid
from sqlalchemy import Column, String, DateTime, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy import UUID
from app.db.base import Base
from app.models.enums import UserRole


class User(Base):
    """User (使用者)：記錄系統中的使用者資訊。
    
    - id (PK): UUID，唯一識別碼。
    - username: String，unique，帳號。
    - full_name: String，使用者姓名。
    - password_hash: String，加密後的密碼。
    - role: Enum (Admin / Candidate)，區分面試主管與考生。
    - created_at: DateTime，帳號建立時間。
    """
    __tablename__ = "users"

    # 定義欄位
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String(100), unique=True, index=True, nullable=False)
    full_name = Column(String(100), nullable=True) # 建議增加，方便主管識別
    password_hash = Column(String(255), nullable=False)
    
    role = Column(Enum(UserRole), default=UserRole.Candidate, nullable=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # 定義關聯
    managed_exams = relationship("Exam", foreign_keys="[Exam.creator_id]", back_populates="interviewer", cascade="all, delete-orphan")
    assigned_exams = relationship("Exam", foreign_keys="[Exam.candidate_id]", back_populates="candidate", cascade="all, delete-orphan")
    created_problems = relationship("Problem", back_populates="questioner")
    submissions = relationship("Submission", back_populates="user", cascade="all, delete-orphan")