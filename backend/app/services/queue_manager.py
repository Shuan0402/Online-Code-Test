# app/services/queue_manager.py
import json
import logging
from app.core.redis_client import redis_client

log = logging.getLogger(__name__)


class TaskQueue:
    QUEUE_PENDING = "submissions:pending"
    QUEUE_PROCESSING = "submissions:processing"
    
    def __init__(self):
        self.client = redis_client
        self.queue_name = "oj_judge_queue"

    def push_to_queue(self, queue_name: str, data: dict) -> bool:
        """
        將指定資料序列化為 JSON 後，壓入指定 Redis List 的右側 (RPUSH)。
        """
        try:
            self.client.rpush(queue_name, json.dumps(data))
            return True
        except Exception as e:
            log.error("Error pushing to Redis: {}, queue_name: {}", e, queue_name)
            return False

queue_manager = TaskQueue()