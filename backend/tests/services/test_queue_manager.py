import uuid
import pytest
from datetime import datetime
from unittest.mock import MagicMock
from app.services.queue_manager import TaskQueue

def test_queue_push_email_success():
    q = TaskQueue()
    q.client = MagicMock()
    data = {
        "to_email": "test@example.com",
        "task_type": "welcome",
        "content": "hello"
    }
    res = q.push_to_queue(q.QUEUE_EMAIL, data)
    assert res is True
    q.client.rpush.assert_called_once()

def test_queue_push_submission_success():
    q = TaskQueue()
    q.client = MagicMock()
    sub_id = uuid.uuid4()
    data = {
        "submission_id": sub_id,
        "user_id": 1,
        "problem_id": 2,
        "created_at": datetime.now()
    }
    res = q.push_to_queue(q.QUEUE_PENDING, data)
    assert res is True
    q.client.rpush.assert_called_once()

def test_queue_push_unserializable_raises_type_error():
    q = TaskQueue()
    q.client = MagicMock()
    class Unserializable:
        pass
    data = {
        "submission_id": "123",
        "bad_field": Unserializable()
    }
    # Should catch serialization error, log exception and return False
    res = q.push_to_queue(q.QUEUE_PENDING, data)
    assert res is False
    q.client.rpush.assert_not_called()

def test_queue_push_redis_exception():
    q = TaskQueue()
    q.client = MagicMock()
    q.client.rpush.side_effect = Exception("Redis connection lost")
    data = {
        "submission_id": "123"
    }
    res = q.push_to_queue(q.QUEUE_PENDING, data)
    assert res is False
