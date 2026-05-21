import json
import logging
import pytest
from app.core.logging import setup_logging

def test_json_formatter_output_structure(capsys):
    """
    確保 setup_logging 啟動後，輸出的日誌是合法 JSON，且包含所有維運戰情室必備的核心欄位。
    """
    setup_logging(log_level="INFO")
    
    logger = logging.getLogger("test_logger")
    logger.info("Hello Online Judge Engine!")
    
    captured = capsys.readouterr()
    log_output = captured.out.strip()
    
    last_line = log_output.split("\n")[-1]
    
    try:
        parsed_json = json.loads(last_line)
    except json.JSONDecodeError:
        pytest.fail("日誌輸出不是合法的 JSON 格式！")
        
    assert "timestamp" in parsed_json
    assert "level" in parsed_json
    assert parsed_json["level"] == "INFO"
    assert parsed_json["logger"] == "test_logger"
    assert parsed_json["message"] == "Hello Online Judge Engine!"
    assert "module" in parsed_json
    assert "function" in parsed_json


def test_json_formatter_extra_fields(capsys):
    """
    確保自訂的 extra 屬性（如 submission_id）
    能被正確提煉並壓入 JSON 的根節點，供 Promtail 提煉標籤。
    """
    setup_logging(log_level="INFO")
    logger = logging.getLogger("test_extra")
    
    logger.info("Submission processed", extra={"submission_id": 999, "exam_id": 402})
    
    captured = capsys.readouterr()
    last_line = captured.out.strip().split("\n")[-1]
    parsed_json = json.loads(last_line)
    
    assert parsed_json["submission_id"] == 999
    assert parsed_json["exam_id"] == 402


def test_json_formatter_exception_traceback(capsys):
    """
    確保當系統崩潰時，錯誤堆疊（Traceback）
    有被整齊打包進 JSON，而不會導致 log 機制自己死鎖。
    """
    setup_logging(log_level="ERROR")
    logger = logging.getLogger("test_exception")
    
    try:
        1 / 0
    except ZeroDivisionError:
        logger.exception("計算模組炸裂")
        
    captured = capsys.readouterr()
    last_line = captured.out.strip().split("\n")[-1]
    parsed_json = json.loads(last_line)
    
    assert parsed_json["level"] == "ERROR"
    assert parsed_json["message"] == "計算模組炸裂"
    assert "exception" in parsed_json
    assert "ZeroDivisionError" in parsed_json["exception"]