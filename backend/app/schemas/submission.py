from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict, field_validator
from datetime import datetime
from typing import List, Literal, Optional
from app.models.enums import JudgeStatus

class SubmissionBase(BaseModel):
    """
    定義 Submission 的基本欄位，Create 和 Read 都會用到。
    """
    language: str = Field(..., json_schema_extra={"example": "python"})
    code_s3_url: str = Field(..., description="程式碼存放路徑")

class SubmissionCreate(BaseModel):
    """
    定義 SubmissionCreate 的欄位，考生提交程式碼時使用。
    """
    problem_id: int
    exam_id: Optional[UUID] = None
    language: str = Field(..., json_schema_extra={"example": "python"})
    source_code: str = Field(..., json_schema_extra={"example": "print('Hello World')"})
    submission_type: str = Field("OFFICIAL", description="必須為 OFFICIAL")

    @field_validator("submission_type")
    @classmethod
    def validate_submission_type(cls, v: str) -> str:
        if v.upper() == "RUN_ONLY":
            raise ValueError("此版本尚未支援 'RUN_ONLY' 運行模式，請使用 'OFFICIAL' 繳交。")
        return v.upper()
    
    @field_validator("language")
    @classmethod
    def validate_language(cls, v: str) -> str:
        allowed_languages = ["python", "cpp"]
        if v.lower() not in allowed_languages:
            raise ValueError(f"暫不支援 '{v}' 語言。目前僅開放: {allowed_languages}")
        return v.lower()

class JudgeTaskPayload(BaseModel):
    """
    丟進 Redis 的任務負載 (給 Worker 看的)。
    """
    submission_id: UUID
    problem_id: int
    language: str
    presigned_url: str = Field(..., description="時效性高的 S3 預簽章下載連結")
    time_limit: int = Field(..., description="時間限制 (ms)")
    memory_limit: int = Field(..., description="記憶體限制 (MB)")

class CallbackTestcase(BaseModel):
    """Worker callback 中每筆 testcase 的結果。

    case_verdict 用 str 而非 JudgeStatus enum，避免 worker 送來新值（例如未來
    加 PE / OLE）時 Pydantic 直接 422、callback 訊息卡 processing 無法 ACK。
    """
    testcase_id: int
    case_verdict: str
    exec_time_ms: int


class JudgeCallbackPayload(BaseModel):
    """Worker → backend POST /internal/judge-callback 的 body（合約 3 + Step 9）。

    Step 9：加 `verdict` discriminator + `failure_reason` 支援失敗路徑。
    - verdict="Success"（default）→ 走 Step 8 既有 per_testcase + 算分路徑
    - verdict="JudgeFailed" → 直接寫 status=JudgeFailed + failure_reason、其他欄位忽略
    backwards compat：default = Success、Step 8 worker 不用改也跑。
    """
    submission_id: UUID
    verdict: Literal["Success", "JudgeFailed"] = "Success"
    # Success path 欄位（verdict=Success 時）
    per_testcase: List[CallbackTestcase] = Field(default_factory=list)
    exec_time_ms: int = 0
    memory_mb: Optional[int] = Field(default=None, description="step 9+ 才填")
    judge_log: str = ""
    # Failure path 欄位（verdict=JudgeFailed 時）
    failure_reason: Optional[str] = Field(
        default=None,
        description="只在 verdict=JudgeFailed 時填、worker 寫 repr(e) + 完整 traceback",
    )

class SubmissionDetailRead(BaseModel):
    """
    SubmissionDetail 的回傳格式。
    """
    id: int
    testcase_id: int
    status: JudgeStatus
    execution_time: Optional[int] = None
    memory_usage: Optional[int] = None
    score: int
    runtime_info: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True)

class SubmissionRead(SubmissionBase):
    """
    回傳給前端。
    """
    id: UUID
    user_id: UUID
    problem_id: int
    exam_id: Optional[UUID] = None
    submission_type: str
    language: str
    code_s3_url: str
    client_ip: Optional[str] = None
    status: JudgeStatus
    score: int
    
    execution_time: Optional[int] = None
    memory_usage: Optional[int] = None
    judge_log: Optional[str] = None
    created_at: datetime

    details: List[SubmissionDetailRead] = []

    presigned_url: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True)