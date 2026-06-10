import sys
import os
import pathlib
import json
import logging
import smtplib
import time
import pytest
from unittest.mock import patch, MagicMock, ANY

# Import the email worker module by adding its directory to sys.path
EMAIL_WORKER_DIR = pathlib.Path(__file__).parent.parent.parent / "email-worker"
sys.path.insert(0, str(EMAIL_WORKER_DIR))

import main as email_worker

def test_worker_json_formatter():
    formatter = email_worker.WorkerJSONFormatter()
    record = logging.LogRecord(
        name="test-logger",
        level=logging.INFO,
        pathname="test_file.py",
        lineno=10,
        msg="Hello %s",
        args=("world",),
        exc_info=None
    )
    # Add extra attribute
    record.__dict__["extra_field"] = "extra_value"
    
    formatted_str = formatter.format(record)
    data = json.loads(formatted_str)
    
    assert data["message"] == "Hello world"
    assert data["level"] == "INFO"
    assert data["logger"] == "test-logger"
    assert data["extra_field"] == "extra_value"
    assert "timestamp" in data


def test_worker_json_formatter_with_exception():
    formatter = email_worker.WorkerJSONFormatter()
    try:
        raise ValueError("test error")
    except ValueError:
        exc_info = sys.exc_info()
        
    record = logging.LogRecord(
        name="test-logger",
        level=logging.ERROR,
        pathname="test_file.py",
        lineno=20,
        msg="An error occurred",
        args=(),
        exc_info=exc_info
    )
    
    formatted_str = formatter.format(record)
    data = json.loads(formatted_str)
    assert "exception" in data
    assert "ValueError: test error" in data["exception"]


@patch("smtplib.SMTP")
def test_send_smtp_email(mock_smtp):
    mock_server = MagicMock()
    mock_smtp.return_value.__enter__.return_value = mock_server
    
    email_worker.send_smtp_email("user@example.com", "Test Subject", "<h1>Test</h1>")
    
    mock_smtp.assert_called_with(email_worker.SMTP_HOST, email_worker.SMTP_PORT, timeout=10)
    mock_server.sendmail.assert_called_once()
    args = mock_server.sendmail.call_args[0]
    assert args[0] == "Online OJ System <noreply@ntut-ee-cs.edu.tw>"
    assert args[1] == ["user@example.com"]
    assert "Test Subject" in args[2]


@patch("main.send_smtp_email")
def test_process_email_task_password_reset(mock_send):
    msg = {
        "to_email": "candidate@example.com",
        "task_type": "PASSWORD_RESET",
        "context": {
            "username": "candidate01",
            "reset_url": "http://reset",
            "expire_minutes": 20
        }
    }
    email_worker.process_email_task(msg)
    mock_send.assert_called_once_with(
        "candidate@example.com",
        "【OJ】請重設您的帳號密碼",
        ANY
    )
    # Verify content rendering
    rendered_html = mock_send.call_args[0][2]
    assert "candidate01" in rendered_html
    assert "http://reset" in rendered_html


@patch("main.send_smtp_email")
def test_process_email_task_unsupported(mock_send):
    msg = {
        "to_email": "candidate@example.com",
        "task_type": "UNSUPPORTED",
        "context": {}
    }
    with patch.object(email_worker.log, "warning") as mock_warn:
        email_worker.process_email_task(msg)
        mock_send.assert_not_called()
        mock_warn.assert_called_once()


@patch("main.send_smtp_email")
def test_process_email_task_exception(mock_send):
    mock_send.side_effect = Exception("SMTP error")
    msg = {
        "to_email": "candidate@example.com",
        "task_type": "PASSWORD_RESET",
        "context": {}
    }
    with patch.object(email_worker.log, "error") as mock_error:
        # Should not raise exception
        email_worker.process_email_task(msg)
        mock_error.assert_called_once()


@patch("redis.from_url")
@patch("main.process_email_task")
@patch("time.sleep")
def test_main_flow(mock_sleep, mock_process, mock_redis_from_url, tmp_path):
    # Setup mocks
    mock_redis = MagicMock()
    mock_redis_from_url.return_value = mock_redis
    
    # Mock lmove for boot sweep (return None to exit loop immediately)
    mock_redis.lmove.side_effect = ["processing_task", None]
    
    # Mock blmove to return None first (triggers line 124 continue), then a task, then KeyboardInterrupt
    task_payload = json.dumps({
        "to_email": "test@example.com",
        "task_type": "PASSWORD_RESET",
        "context": {}
    })
    mock_redis.blmove.side_effect = [None, task_payload, KeyboardInterrupt("Exit loop")]
    
    # Setup log file path to cover file handler path
    log_file = tmp_path / "test_worker.log"
    
    with patch.dict(os.environ, {"LOG_FILE_PATH": str(log_file)}):
        with pytest.raises(KeyboardInterrupt):
            email_worker.main()
            
    # Verify sweep loop ran
    assert mock_redis.lmove.call_count == 2
    # Verify task was processed and removed
    mock_process.assert_called_once()
    mock_redis.lrem.assert_called_once_with(email_worker.QUEUE_EMAIL_PROCESSING, 1, task_payload)
    
    # Verify log file was created
    assert log_file.exists()


@patch("redis.from_url")
@patch("main.process_email_task")
def test_main_corrupt_payload(mock_process, mock_redis_from_url):
    mock_redis = MagicMock()
    mock_redis_from_url.return_value = mock_redis
    mock_redis.lmove.return_value = None
    
    # blmove returns corrupt payload, then raises KeyboardInterrupt
    corrupt_payload = "{corrupt_json"
    mock_redis.blmove.side_effect = [corrupt_payload, KeyboardInterrupt()]
    
    with patch.object(email_worker.log, "error") as mock_log_error:
        with pytest.raises(KeyboardInterrupt):
            email_worker.main()
            
    # Should not process, should remove and log error
    mock_process.assert_not_called()
    mock_redis.lrem.assert_called_once_with(email_worker.QUEUE_EMAIL_PROCESSING, 1, corrupt_payload)
    mock_log_error.assert_called_once()


@patch("redis.from_url")
@patch("time.sleep")
def test_main_loop_exception_retry(mock_sleep, mock_redis_from_url):
    mock_redis = MagicMock()
    mock_redis_from_url.return_value = mock_redis
    mock_redis.lmove.return_value = None
    
    # blmove raises ValueError, then KeyboardInterrupt
    mock_redis.blmove.side_effect = [ValueError("Redis connection error"), KeyboardInterrupt()]
    
    with patch.object(email_worker.log, "critical") as mock_log_crit:
        with pytest.raises(KeyboardInterrupt):
            email_worker.main()
            
    # Should log critical and sleep
    mock_log_crit.assert_called_once()
    mock_sleep.assert_called_once_with(1.0)


@patch("redis.from_url")
def test_main_logging_setup_error(mock_redis_from_url, capsys):
    mock_redis = MagicMock()
    mock_redis_from_url.return_value = mock_redis
    mock_redis.lmove.return_value = None
    mock_redis.blmove.side_effect = KeyboardInterrupt()
    
    with patch.dict(os.environ, {"LOG_FILE_PATH": "dummy_path.log"}):
        with patch("logging.FileHandler", side_effect=OSError("Permission denied")):
            with pytest.raises(KeyboardInterrupt):
                email_worker.main()
            
    # Setup error message should print to stderr
    captured = capsys.readouterr()
    assert "[Logging Setup Error]" in captured.err


def test_email_worker_direct_main():
    with patch("redis.from_url") as mock_redis_from_url:
        mock_redis = MagicMock()
        mock_redis_from_url.return_value = mock_redis
        mock_redis.lmove.return_value = None
        mock_redis.blmove.side_effect = KeyboardInterrupt()
        
        with open(EMAIL_WORKER_DIR / "main.py", "r", encoding="utf-8") as f:
            code = f.read()
            
        global_ns = {
            "__name__": "__main__",
            "__file__": str((EMAIL_WORKER_DIR / "main.py").resolve())
        }
        code_obj = compile(code, str((EMAIL_WORKER_DIR / "main.py").resolve()), "exec")
        
        with pytest.raises(KeyboardInterrupt):
            exec(code_obj, global_ns)

