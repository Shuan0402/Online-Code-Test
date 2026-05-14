import redis
import os


REDIS_HOST = os.getenv("REDIS_HOST", "redis")

# 建立全域共享的 Redis 客戶端
redis_client = redis.Redis(
    host=REDIS_HOST,
    port=6379,
    db=0,
    decode_responses=True
)