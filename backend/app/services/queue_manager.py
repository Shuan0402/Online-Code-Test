# app/services/queue_manager.py
import json
import logging
from app.core.redis_client import redis_client

log = logging.getLogger("app")


class TaskQueue:
    QUEUE_PENDING = "submissions:pending"
    QUEUE_PROCESSING = "submissions:processing"

    QUEUE_EMAIL = "messages:email"
    
    def __init__(self):
        self.client = redis_client
        self.queue_name = "submissions:pending"

    def push_to_queue(self, queue_name: str, data: dict) -> bool:
        """
        將指定資料序列化為 JSON 後，壓入指定 Redis List 的右側 (RPUSH)。
        支援泛用任務（判題、郵件非同步發送）。
        """
        if queue_name == self.QUEUE_EMAIL:
            task_id = data.get("to_email", "unknown")
            log_msg_success = f"郵件任務成功壓入 Redis 隊列 | TargetEmail: {task_id}, Queue: {queue_name}"
            log_msg_failed = f"嚴重錯誤：無法將郵件任務壓入 Redis 隊列！ [TargetEmail: {task_id}]"
            extra_data = {
                "to_email": task_id,
                "task_type": data.get("task_type", "unknown"),
                "queue_name": queue_name,
                "action": "email_queue_push_success"
            }
        else:
            task_id = data.get("submission_id", "unknown")
            log_msg_success = f"判題任務成功壓入 Redis 隊列 | SubmissionID: {task_id}, Queue: {queue_name}"
            log_msg_failed = f"嚴重錯誤：無法將判題任務壓入 Redis 隊列！ [SubmissionID: {task_id}]"
            extra_data = {
                "submission_id": task_id,
                "user_id": data.get("user_id", "unknown"),
                "problem_id": data.get("problem_id", "unknown"),
                "queue_name": queue_name,
                "action": "queue_push_success"
            }
        

        try:
            payload = json.dumps(data)
            self.client.rpush(queue_name, payload)
            
            log.info(log_msg_success, extra=extra_data)
            return True
        except Exception as e:
            extra_data["action"] = "email_queue_push_failed" if queue_name == self.QUEUE_EMAIL else "queue_push_failed"
            extra_data["error_msg"] = str(e)
            
            log.exception(log_msg_failed, extra=extra_data)
            return False

queue_manager = TaskQueue()