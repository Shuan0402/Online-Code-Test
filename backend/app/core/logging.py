import json
import logging
import os
import sys
from datetime import datetime, timezone, date
from uuid import UUID

class HealthCheckFilter(logging.Filter):
    """
    攔截 Uvicorn 存取日誌中包含 /health 的點擊紀錄，避免 Grafana 被 health check 洗版
    """
    def filter(self, record: logging.LogRecord) -> bool:
        if record.args and len(record.args) >= 3:
            if "/health" in str(record.args[2]):
                return False
        return "/health" not in record.getMessage()
    
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

        def json_serial_fallback(obj):
            """
            當 json.dumps 找不到對應型態時，一律安全降級轉為字串，防止日誌崩潰
            """
            cls_name = obj.__class__.__name__

            if cls_name in ("datetime", "date"):
                return obj.isoformat()
            if isinstance(obj, UUID) or cls_name == "UUID":
                return str(obj)
                
            return f"<Not Serializable: {type(obj).__name__}>"

        try:
            return json.dumps(log_data, default=json_serial_fallback, ensure_ascii=False)
        except Exception:
            return f'{{"level": "{record.levelname}", "message": "Log serialization fatal error", "raw": "{record.getMessage()}"}}'


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
    health_filter = HealthCheckFilter()

    stdout_handler = logging.StreamHandler(sys.stdout)
    stdout_handler.setFormatter(json_formatter)
    stdout_handler.addFilter(health_filter)
    root_logger.addHandler(stdout_handler)

    file_path = os.environ.get("LOG_FILE_PATH", "/app/logs/backend.log")
    log_dir = os.path.dirname(file_path) or "."
    try:
        os.makedirs(log_dir, exist_ok=True)
        
        file_handler = logging.FileHandler(file_path, encoding="utf-8")
        file_handler.setFormatter(json_formatter)
        file_handler.addFilter(health_filter)
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
        tgt_logger.addFilter(health_filter)