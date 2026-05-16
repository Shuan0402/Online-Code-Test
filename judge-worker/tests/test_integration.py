"""
End-to-end integration tests — real Redis + real DockerSpawner + real sandbox images.

Marked @pytest.mark.integration; default suite skips them. Run with:
    pytest tests/ -m integration

Prereqs (caller responsibility):
  - Redis listening on localhost:6379 (e.g. `docker compose up -d redis`)
  - Docker daemon accessible (Docker Desktop / colima running)
  - sandbox:python and sandbox:cpp images built (judge-sandbox/images/*)

Mock points: only HTTP is mocked (pytest-httpserver). Source URLs and the
backend callback URL both point at the in-test http server.
"""

import json

import pytest
import redis
import requests
from werkzeug.wrappers import Response

import worker
from spawner.docker_spawner import DockerSpawner


pytestmark = pytest.mark.integration


REDIS_TEST_DB = 15   # 用獨立 DB 避免撞 dev queue


# ── fixtures ───────────────────────────────────────────────────────


@pytest.fixture
def real_redis():
    r = redis.Redis(host="localhost", port=6379, db=REDIS_TEST_DB, decode_responses=False)
    r.flushdb()
    yield r
    r.flushdb()


@pytest.fixture
def callback_recorder(httpserver, monkeypatch):
    """Capture callback POSTs; point worker.BACKEND_URL + WORKER_SECRET at httpserver."""
    received = []

    def handler(request):
        received.append(request.get_json())
        return Response(status=200)

    httpserver.expect_request(
        "/internal/judge-callback", method="POST"
    ).respond_with_handler(handler)

    backend_url = f"http://{httpserver.host}:{httpserver.port}"
    monkeypatch.setattr(worker, "BACKEND_URL", backend_url)
    monkeypatch.setattr(worker, "WORKER_SECRET", "integration-secret")

    return received


@pytest.fixture
def source_server(httpserver):
    """Serve source code at a given path; return the full URL."""
    def _serve(path: str, body: str) -> str:
        httpserver.expect_request(path).respond_with_data(body)
        return httpserver.url_for(path)
    return _serve


# ── tests ──────────────────────────────────────────────────────────


def test_python_ac_full_path(real_redis, callback_recorder, source_server):
    source_url = source_server(
        "/sub-py-ac.py",
        "a, b = map(int, input().split())\nprint(a + b)\n",
    )
    msg = {
        "submission_id": "int-py-ac",
        "language": "python",
        "presigned_url": source_url,
        "submission_type": "OFFICIAL",
        "time_limit_ms": 5000,
        "memory_limit_mb": 256,
        "testcases": [
            {"testcase_id": 1, "input_data": "1 2\n", "expected_output": "3\n", "is_sample": True},
            {"testcase_id": 2, "input_data": "10 20\n", "expected_output": "30\n", "is_sample": False},
        ],
    }
    real_redis.rpush(worker.QUEUE_PENDING, json.dumps(msg).encode())

    acked = worker.consume_once(real_redis, DockerSpawner(), requests.Session())

    assert acked is True
    assert real_redis.llen(worker.QUEUE_PROCESSING) == 0
    assert len(callback_recorder) == 1
    cb = callback_recorder[0]
    assert cb["submission_id"] == "int-py-ac"
    assert [tc["case_verdict"] for tc in cb["per_testcase"]] == ["AC", "AC"]


def test_python_wa_fail_fast_full_path(real_redis, callback_recorder, source_server):
    """tc1 AC、tc2 WA、tc3 不該跑（fail-fast）。"""
    source_url = source_server(
        "/sub-py-wa.py",
        "_ = input()\nprint(3)\n",   # 永遠 print 3
    )
    msg = {
        "submission_id": "int-py-wa",
        "language": "python",
        "presigned_url": source_url,
        "submission_type": "OFFICIAL",
        "time_limit_ms": 5000,
        "memory_limit_mb": 256,
        "testcases": [
            {"testcase_id": 1, "input_data": "1 2\n", "expected_output": "3\n", "is_sample": True},
            {"testcase_id": 2, "input_data": "5 7\n", "expected_output": "12\n", "is_sample": False},
            {"testcase_id": 3, "input_data": "9 1\n", "expected_output": "10\n", "is_sample": False},
        ],
    }
    real_redis.rpush(worker.QUEUE_PENDING, json.dumps(msg).encode())

    worker.consume_once(real_redis, DockerSpawner(), requests.Session())

    cb = callback_recorder[0]
    assert len(cb["per_testcase"]) == 2, "fail-fast should break after WA, tc3 not run"
    assert [tc["case_verdict"] for tc in cb["per_testcase"]] == ["AC", "WA"]


def test_cpp_ce_full_path(real_redis, callback_recorder, source_server):
    """g++ 編譯失敗 → entrypoint exit 100 → decide_case_verdict 判 CE。"""
    source_url = source_server(
        "/sub-cpp-ce.cpp",
        "int main() { broken syntax }\n",
    )
    msg = {
        "submission_id": "int-cpp-ce",
        "language": "cpp",
        "presigned_url": source_url,
        "submission_type": "OFFICIAL",
        "time_limit_ms": 5000,
        "memory_limit_mb": 256,
        "testcases": [
            {"testcase_id": 1, "input_data": "", "expected_output": "", "is_sample": True},
        ],
    }
    real_redis.rpush(worker.QUEUE_PENDING, json.dumps(msg).encode())

    worker.consume_once(real_redis, DockerSpawner(), requests.Session())

    cb = callback_recorder[0]
    assert cb["per_testcase"][0]["case_verdict"] == "CE"
    # judge_log 應該含 g++ stderr（'broken' was not declared in this scope）
    assert "broken" in cb["judge_log"] or "scope" in cb["judge_log"]


def test_redelivery_after_crash(real_redis, callback_recorder, source_server):
    """模擬 worker crash mid-judge：訊息卡 processing、新 worker startup_sweep 撈回重做。"""
    source_url = source_server(
        "/sub-redeliv.py",
        "_ = input()\nprint('ok')\n",
    )
    msg = {
        "submission_id": "int-redeliv",
        "language": "python",
        "presigned_url": source_url,
        "submission_type": "OFFICIAL",
        "time_limit_ms": 5000,
        "memory_limit_mb": 256,
        "testcases": [
            {"testcase_id": 1, "input_data": "x\n", "expected_output": "ok\n", "is_sample": True},
        ],
    }
    raw = json.dumps(msg).encode()

    # 模擬前一 worker 已 BLMOVE 進 processing、判到一半死掉
    real_redis.rpush(worker.QUEUE_PROCESSING, raw)
    assert real_redis.llen(worker.QUEUE_PENDING) == 0
    assert real_redis.llen(worker.QUEUE_PROCESSING) == 1

    # 新 worker 啟動：sweep 撈回 pending
    swept = worker.startup_sweep(real_redis)
    assert swept == 1
    assert real_redis.llen(worker.QUEUE_PENDING) == 1
    assert real_redis.llen(worker.QUEUE_PROCESSING) == 0

    # 後面流程跑完
    acked = worker.consume_once(real_redis, DockerSpawner(), requests.Session())

    assert acked is True
    assert real_redis.llen(worker.QUEUE_PROCESSING) == 0
    cb = callback_recorder[0]
    assert cb["submission_id"] == "int-redeliv"
    assert cb["per_testcase"][0]["case_verdict"] == "AC"
