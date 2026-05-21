import json
import logging
import os
import sys
from datetime import datetime, timezone

class JSONFormatter(logging.Formatter):
    """
    工業級標準 JSON 日誌格式化器
    支援動態提煉 extra 屬性，並強制將時間戳轉換為 ISO-8601 格式
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
    接管全域日誌系統（FastAPI, Uvicorn, Celery），全面清洗並導流至高純度 JSON 輸出
    """
    log_level_upper = log_level.upper()
    
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level_upper)
    
    if root_logger.hasHandlers():
        root_logger.handlers.clear()

    json_formatter = JSONFormatter()

    stdout_handler = logging.StreamHandler(sys.stdout)
    stdout_handler.setFormatter(json_formatter)
    root_logger.addHandler(stdout_handler)

    log_dir = "/app/logs"
    try:
        os.makedirs(log_dir, exist_ok=True)
        file_path = os.path.join(log_dir, "backend.log")
        
        file_handler = logging.FileHandler(file_path, encoding="utf-8")
        file_handler.setFormatter(json_formatter)
        root_logger.addHandler(file_handler)
        
        print(f"[Logging Infra] Success! Global JSON FileHandler attached to {file_path}", flush=True)
    except Exception as e:
        print(f"[Logging Infra] Failed to create FileHandler: {e}", flush=True)

    third_party_loggers = [
        "uvicorn",
        "uvicorn.access",
        "uvicorn.error",
        "celery",
    ]
    for logger_name in third_party_loggers:
        tgt_logger = logging.getLogger(logger_name)
        tgt_logger.handlers.clear()
        tgt_logger.propagate = True