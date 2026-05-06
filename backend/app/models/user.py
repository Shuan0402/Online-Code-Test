import uuid
from sqlalchemy import Column, Integer, String, DateTime, Enum
import datetime
from datetime import UTC
from app.database import Base
import enum

class UserRole(enum.Enum):
    ADMIN = "Admin"
    CANDIDATE = "Candidate"

class JudgeStatus(enum.Enum):
    PENDING = "Pending"
    JUDGING = "Judging"
    AC = "AC"
    WA = "WA"
    TLE = "TLE"
    MLE = "MLE"
    RE = "RE"
    CE = "CE"

class User(Base):
    """User (使用者)：記錄系統中的使用者資訊。
    
    - id (PK): UUID，唯一識別碼。
    - username: String，Unique，帳號。
    - password_hash: String，加密後的密碼。
    - role: Enum (Admin / Candidate)，區分面試主管與考生。
    - created_at: DateTime，帳號建立時間。
    """
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String(100), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), default="candidate")
    created_at = Column(DateTime, default=datetime.datetime.now(UTC))