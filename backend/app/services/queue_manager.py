# app/services/queue_manager.py
import json
import logging
from app.core.redis_client import redis_client

log = logging.getLogger("app")


class TaskQueue:
    QUEUE_PENDING = "submissions:pending"
    QUEUE_PROCESSING = "submissions:processing"
    
    def __init__(self):
        self.client = redis_client
        self.queue_name = "submissions:pending"

    def push_to_queue(self, queue_name: str, data: dict) -> bool:
        """
        將指定資料序列化為 JSON 後，壓入指定 Redis List 的右側 (RPUSH)。
        """
        submission_id = data.get("submission_id", "unknown")
        user_id = data.get("user_id", "unknown")
        problem_id = data.get("problem_id", "unknown")

        try:
            payload = json.dumps(data)
            self.client.rpush(queue_name, payload)
            
            log.info(
                f"判題任務成功壓入 Redis 隊列 | SubmissionID: {submission_id}, Queue: {queue_name}",
                extra={
                    "submission_id": submission_id,
                    "user_id": user_id,
                    "problem_id": problem_id,
                    "queue_name": queue_name,
                    "action": "queue_push_success"
                }
            )
            return True
        except Exception as e:
            log.exception(
                f"嚴重錯誤：無法將判題任務壓入 Redis 隊列！ [SubmissionID: {submission_id}]",
                extra={
                    "submission_id": submission_id,
                    "user_id": user_id,
                    "problem_id": problem_id,
                    "queue_name": queue_name,
                    "action": "queue_push_failed"
                }
            )
            return False

queue_manager = TaskQueue()