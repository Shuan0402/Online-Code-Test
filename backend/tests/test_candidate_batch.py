import io
from dataclasses import asdict

import pytest
from openpyxl import Workbook

from app.schemas.user import BatchImportResult, BatchImportRowResult
from app.services.candidate_batch import BatchImportRowOutcome, BatchImportSummary

from app.core.config import settings
from app.models.candidate_tag import CandidateTag
from app.models.user import User
from app.services.candidate_password import generate_candidate_password
from app.services.candidate_batch import (
    parse_candidate_upload,
    batch_import_candidates,
    BatchImportFileError,
)


def test_generate_candidate_password_is_deterministic_eight_alnum(monkeypatch):
    monkeypatch.setattr(settings, "CANDIDATE_PASSWORD_SHA_SECRET", "unit-test-secret")
    pwd_a = generate_candidate_password("alice123")
    pwd_b = generate_candidate_password("alice123")
    pwd_c = generate_candidate_password("bob45678")

    assert pwd_a == pwd_b
    assert pwd_a != pwd_c
    assert len(pwd_a) == 8
    assert pwd_a.isalnum()


def test_parse_candidate_upload_csv():
    content = "真實姓名,帳號\n愛麗絲,alice01\n,\n"
    rows = parse_candidate_upload(content.encode("utf-8-sig"), "candidates.csv")
    assert len(rows) == 1
    assert rows[0].full_name == "愛麗絲"
    assert rows[0].username == "alice01"


def test_parse_candidate_upload_xlsx():
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(["真實姓名", "帳號"])
    sheet.append(["鮑伯", "bob23456"])
    buffer = io.BytesIO()
    workbook.save(buffer)

    rows = parse_candidate_upload(buffer.getvalue(), "candidates.xlsx")
    assert len(rows) == 1
    assert rows[0].full_name == "鮑伯"
    assert rows[0].username == "bob23456"


def test_parse_candidate_upload_missing_columns():
    content = "姓名,帳號\n測試,test01\n"
    with pytest.raises(BatchImportFileError, match="缺少必要欄位"):
        parse_candidate_upload(content.encode("utf-8"), "bad.csv")


def test_batch_import_response_serializes_service_outcomes():
    """服務層 outcome 需能轉成 API schema，避免同名 class 造成 500。"""
    summary = BatchImportSummary(
        total=1,
        created=1,
        failed=0,
        results=[
            BatchImportRowOutcome(
                row=2,
                username="batch001",
                full_name="測試",
                status="created",
                generated_password="pass1234",
            )
        ],
    )
    payload = BatchImportResult(
        total=summary.total,
        created=summary.created,
        failed=summary.failed,
        results=[
            BatchImportRowResult.model_validate(asdict(r))
            for r in summary.results
        ],
    )
    assert payload.created == 1
    assert payload.results[0].generated_password == "pass1234"


def test_batch_import_candidates_applies_tags_and_password(db_session):
    rows = parse_candidate_upload(
        "真實姓名,帳號\n新考生,batch001\n".encode("utf-8"),
        "batch.csv",
    )
    summary = batch_import_candidates(
        db_session,
        rows,
        ["2026 校園徵才 - 前端工程師"],
    )

    assert summary.created == 1
    assert summary.failed == 0
    assert summary.results[0].generated_password is not None
    assert len(summary.results[0].generated_password) == 8

    user = db_session.query(User).filter(User.username == "batch001").one()
    tags = db_session.query(CandidateTag).filter(CandidateTag.user_id == user.id).all()
    assert [t.tag for t in tags] == ["2026 校園徵才 - 前端工程師"]
