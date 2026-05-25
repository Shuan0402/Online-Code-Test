import json
import logging
import os
import sys
import time
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone
from jinja2 import Environment, FileSystemLoader, select_autoescape

class WorkerJSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        for key, value in record.__dict__.items():
            if key not in {"args", "asctime", "created", "exc_info", "exc_text", "filename", "msg", "name", "levelname"}:
                log_data[key] = value
        return json.dumps(log_data, ensure_ascii=False)

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
SMTP_HOST = os.getenv("SMTP_HOST", "mailhog")
SMTP_PORT = int(os.getenv("SMTP_PORT", "1025"))

QUEUE_EMAIL_PENDING = "messages:email"
QUEUE_EMAIL_PROCESSING = "messages:email:processing"

log = logging.getLogger("email-worker")

TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), "templates")
jinja_env = Environment(
    loader=FileSystemLoader(TEMPLATE_DIR),
    autoescape=select_autoescape(["html", "xml"])
)

def send_smtp_email(to_email: str, subject: str, html_content: str) -> None:
    """透過標準 SMTP 協定將郵件送入 Mailhog/真實伺服器"""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = "Online OJ System <noreply@ntut-ee-cs.edu.tw>"
    msg["To"] = to_email

    msg.attach(MIMEText(html_content, "html", "utf-8"))

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
        server.sendmail(msg["From"], [to_email], msg.as_string())

def process_email_task(msg: dict) -> None:
    """解析任務、加載模板、渲染變數、擊發郵件。永不 raise！"""
    to_email = msg["to_email"]
    task_type = msg["task_type"]
    context = msg["context"]

    worker_extra = {"to_email": to_email, "task_type": task_type}

    try:
        if task_type == "PASSWORD_RESET":
            subject = "【OJ】請重設您的帳號密碼"
            template = jinja_env.get_template("password_reset.html")
            html_content = template.render(
                username=context.get("username"),
                reset_url=context.get("reset_url"),
                expire_minutes=context.get("expire_minutes", 15)
            )
        else:
            log.warning(f"未支援的郵件任務類型: {task_type} | 拋棄任務", extra=worker_extra)
            return

        send_smtp_email(to_email, subject, html_content)
        log.info(f"郵件成功投遞至發送閘道器 [收件人: {to_email}]", extra={**worker_extra, "action": "email_sent_success"})

    except Exception as e:
        log.error(
            f"發信管線發生異常 [收件人: {to_email}]: {repr(e)}",
            extra={**worker_extra, "action": "email_pipeline_failure", "exception": repr(e)}
        )

def main() -> None:
    stdout_handler = logging.StreamHandler(sys.stdout)
    stdout_handler.setFormatter(WorkerJSONFormatter())
    
    handlers_list = [stdout_handler]

    log_file_path = os.getenv("LOG_FILE_PATH")
    if log_file_path:
        try:
            log_dir = os.path.dirname(log_file_path)
            if log_dir:
                os.makedirs(log_dir, exist_ok=True)
            
            file_handler = logging.FileHandler(log_file_path, encoding="utf-8")
            file_handler.setFormatter(WorkerJSONFormatter())
            handlers_list.append(file_handler)
        except Exception as handler_err:
            print(f"[Logging Setup Error] 無法建立 FileHandler: {repr(handler_err)}", file=sys.stderr)

    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.handlers = handlers_list

    import redis
    r = redis.from_url(REDIS_URL, decode_responses=True)

    log.info(f"Email Worker 郵件順利開機 | 連接 Redis: {REDIS_URL} | SMTP 閘道: {SMTP_HOST}:{SMTP_PORT}")

    swept = 0
    while r.lmove(QUEUE_EMAIL_PROCESSING, QUEUE_EMAIL_PENDING, "LEFT", "LEFT"):
        swept += 1
    if swept > 0:
        log.warning(f"【開機掃描】成功從死守狀態中拯救了 {swept} 封孤兒信件任務回隊列！")

    log.info(f"進入無限循環，監聽隊列 (BLMOVE {QUEUE_EMAIL_PENDING} ➔ {QUEUE_EMAIL_PROCESSING})...")
    
    while True:
        try:
            raw = r.blmove(QUEUE_EMAIL_PENDING, QUEUE_EMAIL_PROCESSING, timeout=0, src="LEFT", dest="RIGHT")
            if not raw:
                continue

            try:
                task_data = json.loads(raw)
            except json.JSONDecodeError:
                log.error(f"發現毀損的郵件 JSON Payload，強行 ACK 移出隊列: {raw!r}")
                r.lrem(QUEUE_EMAIL_PROCESSING, 1, raw)
                continue

            process_email_task(task_data)

            r.lrem(QUEUE_EMAIL_PROCESSING, 1, raw)

        except Exception as loop_err:
            log.critical(f"主循環遭遇未知嚴重打擊: {repr(loop_err)} | 1秒後重試")
            time.sleep(1.0)

if __name__ == "__main__":
    main()