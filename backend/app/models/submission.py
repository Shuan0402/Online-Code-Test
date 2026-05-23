import uuid
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy import UUID
from app.db.base import Base
from app.models.enums import JudgeStatus


class Submission(Base):
    """Submission (提交)：記錄使用者提交的程式碼與評測結果。
    
    - id (PK): UUID，提交編號。
    - user_id (FK): UUID，誰提交的。
    - problem_id (FK): Integer，考哪一題。
    - exam_id (FK, Nullable): 指向 Exam.id。
    - submission_type: Enum (RUN_ONLY, OFFICIAL)，測試運行與繳交。
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

    submission_type = Column(Enum("RUN_ONLY", "OFFICIAL", name="submission_type"), default="OFFICIAL", nullable=False)

    language = Column(String(50), nullable=False)
    code_s3_url = Column(String(500), nullable=False)
    status = Column(Enum(JudgeStatus), default=JudgeStatus.Pending, nullable=False)
    score = Column(Integer, default=0)

    client_ip = Column(String(45), nullable=True)
    execution_time = Column(Integer, nullable=True)
    memory_usage = Column(Integer, nullable=True)
    judge_log = Column(Text, nullable=True)
    # Step 9: judge pipeline 系統失敗時、worker 把 repr(e) + 完整 traceback 寫入
    # 只在 status=JudgeFailed 時填、其他狀態 NULL；admin only、不暴露給 user-facing endpoint
    failure_reason = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # 定義關聯
    user = relationship("User", back_populates="submissions")
    problem = relationship("Problem", back_populates="submissions")
    exam = relationship("Exam", back_populates="submissions")
    details = relationship("SubmissionDetail", back_populates="submission", cascade="all, delete-orphan")

class SubmissionDetail(Base):
    """
    SubmissionDetail (提交明細)：紀錄該次提交中，每一筆測資 (TestCase) 的具體運行結果。

    - id (PK): Integer，自動遞增。
    - submission_id (FK): UUID，指向 Submission.id。
    - testcase_id (FK): Integer，指向 TestCase.id。
    - status: Enum (Pending / Judging / AC / WA / TLE / MLE / RE / CE)，該測資的評測結果。
    - execution_time: Integer，該測資的實際執行耗時。
    - memory_usage: Integer，該測資的實際記憶體消耗。
    - score: Integer，該測資的得分。
    - runtime_info: Text，該測資的詳細運行資訊 (如錯誤訊息、標準輸出等)。
    """
    __tablename__ = "submission_details"

    # 定義欄位
    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(UUID(as_uuid=True), ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False)
    testcase_id = Column(Integer, ForeignKey("test_cases.id", ondelete="CASCADE"), nullable=False)
    
    status = Column(Enum(JudgeStatus), nullable=False)
    execution_time = Column(Integer, nullable=True) # 單位: ms
    memory_usage = Column(Integer, nullable=True)   # 單位: MB
    score = Column(Integer, default=0)
    runtime_info = Column(Text, nullable=True)

    # 定義關聯
    submission = relationship("Submission", back_populates="details")
    test_case = relationship("TestCase")