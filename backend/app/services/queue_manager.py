# app/services/queue_manager.py
import json
from app.core.redis_client import redis_client
class TaskQueue:
    def __init__(self):
        self.client = redis_client
        self.queue_name = "oj_judge_queue"

    def push_task(self, payload: dict):
        """
        將任務壓入 Redis List 的右側
        """
        try:
            self.client.rpush(self.queue_name, json.dumps(payload))
            return True
        except Exception as e:
            print(f"Error pushing to Redis: {e}")
            return False

queue_manager = TaskQueue()