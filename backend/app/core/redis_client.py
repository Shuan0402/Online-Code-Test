import redis
import logging
import os

logger = logging.getLogger("app")

REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_DB = int(os.getenv("REDIS_DB", 0))

logger.info(
    f"正在初始化 Redis 全域連線池... | Target: {REDIS_HOST}:{REDIS_PORT} (DB: {REDIS_DB})",
    extra={
        "redis_host": REDIS_HOST,
        "redis_port": REDIS_PORT,
        "redis_db": REDIS_DB,
        "action": "redis_client_init"
    }
)

pool = redis.ConnectionPool(
    host=REDIS_HOST,
    port=REDIS_PORT,
    db=REDIS_DB,
    decode_responses=True,
    socket_timeout=5.0,
    socket_keepalive=True,
    health_check_interval=30
)

redis_client = redis.Redis(connection_pool=pool)

try:
    if redis_client.ping():
        logger.info(
            "Redis 基礎設施連線測試成功！底層通訊管道狀態：GREEN",
            extra={"redis_host": REDIS_HOST, "action": "redis_ping_success"}
        )
except redis.exceptions.ConnectionError as conn_err:
    logger.critical(
        f"嚴重基礎設施故障：無法連線至 Redis 伺服器！請立刻檢查 Docker 網路或容器狀態！原因: {conn_err}",
        extra={
            "redis_host": REDIS_HOST,
            "action": "redis_ping_failed_critical",
            "error_type": "RedisConnectionError"
        }
    )