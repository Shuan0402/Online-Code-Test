import redis
import json
import os

class TaskQueue:
    def __init__(self):
        # 讀取 REDIS_HOST 環境變數，若沒設定則預設為 "redis" (Docker 服務名稱)
        redis_host = os.getenv("REDIS_HOST", "redis")

        self.client = redis.Redis(
            host=redis_host,
            port=6379,
            db=0,
            decode_responses=True
        )
        self.queue_name = "oj_judge_queue"

    def push_task(self, payload: dict):
        """
        將任務壓入 Redis List 的右側 (LPUSH/RPUSH)
        """
        try:
            self.client.rpush(self.queue_name, json.dumps(payload))
            return True
        except Exception as e:
            print(f"Error pushing to Redis: {e}")
            return False

queue_manager = TaskQueue()