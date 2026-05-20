import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any

class JSONFormatter(logging.Formatter):
    """
    JSON 日誌格式化器
    """
    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        reserved_attrs = {
            "args", "asctime", "created", "exc_info", "exc_text", "filename",
            "funcName", "levelname", "levelno", "lineno", "module", "msecs",
            "message", "msg", "name", "pathname", "process", "processName",
            "relativeCreated", "stack_info", "thread", "threadName"
        }
        for key, value in record.__dict__.items():
            if key not in reserved_attrs:
                log_data[key] = value

        return json.dumps(log_data, ensure_ascii=False)


def setup_logging(log_level: str = "INFO") -> None:
    """
    接管全域日誌系統（FastAPI, Uvicorn, Celery），將其全部導流至 stdout 並套上 JSONFormatter
    """
    stdout_handler = logging.StreamHandler(sys.stdout)
    stdout_handler.setFormatter(JSONFormatter())

    root_logger = logging.getLogger()
    root_logger.setLevel(log_level.upper())
    
    root_logger.handlers = []
    root_logger.addHandler(stdout_handler)

    intercept_loggers = [
        "uvicorn",
        "uvicorn.error",
        "uvicorn.access",
        "fastapi",
        "gunicorn.error",
        "gunicorn.access"
    ]
    for logger_name in intercept_loggers:
        target_logger = logging.getLogger(logger_name)
        target_logger.handlers = []
        target_logger.propagate = True