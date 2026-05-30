"""
worker.py Step 8 unit tests — fakeredis + 假 spawner + monkey-patch fetch/callback。

不啟動真 Redis、不打 docker、不打網路。
"""

import json
from unittest.mock import MagicMock, patch

import fakeredis
import pytest
import requests

# WORKER_SECRET 由 conftest.py setdefault（這裡 setdefault 太晚、見 conftest 註解）
import worker
from spawner.base import CompletedRun, SpawnerError


# ── helpers ────────────────────────────────────────────────────────


def _make_completed_run(stdout="3\n", stderr="", exit_code=0, timed_out=False, duration=0.05):
    return CompletedRun(
        stdout=stdout,
        stderr=stderr,
        exit_code=exit_code,
        duration_sec=duration,
        timed_out=timed_out,
    )


def _make_msg(
    sub_id="sub-1",
    language="python",
    testcases=None,
    submission_type="OFFICIAL",
    time_limit_ms=1000,
):
    return {
        "submission_id": sub_id,
        "language": language,
        "presigned_url": "http://minio:9000/octest/sub-1.py?sig=x",
        "submission_type": submission_type,
        "time_limit_ms": time_limit_ms,
        "memory_limit_mb": 256,
        "testcases": testcases if testcases is not None else [
            {"testcase_id": 1, "input_data": "1 2\n", "expected_output": "3\n", "is_sample": True},
        ],
    }


@pytest.fixture
def r():
    """Fresh fakeredis client per test."""
    return fakeredis.FakeRedis(decode_responses=False)


@pytest.fixture
def fake_spawner():
    """Spawner mock — set .run.return_value or .run.side_effect in each test."""
    sp = MagicMock()
    sp.run.return_value = _make_completed_run()
    return sp


@pytest.fixture(autouse=True)
def stub_fetch_source(monkeypatch):
    """所有 test 用統一 source；test_fetch_source 自己覆寫。"""
    monkeypatch.setattr(worker, "fetch_source", lambda http, url: "print(3)\n")


@pytest.fixture
def fake_http():
    """requests.Session mock — .post.return_value 預設 200 (success path)。

    Step 9：worker 改用 resp.status_code 判斷成敗、不再 resp.raise_for_status()、
    所以 fixture 必須顯式 set status_code，否則 MagicMock 比較式行為奇怪。
    """
    s = MagicMock(spec=requests.Session)
    resp = MagicMock()
    resp.status_code = 200
    resp.text = ""
    s.post.return_value = resp
    return s


@pytest.fixture(autouse=True)
def fast_backoff(monkeypatch):
    """讓 retry 不要真的 sleep 1 秒，加速 test suite。"""
    monkeypatch.setattr(worker, "CALLBACK_BACKOFF_SEC", 0)


# ── startup_sweep ──────────────────────────────────────────────────


def test_startup_sweep_returns_orphans_to_pending(r):
    """processing 殘留訊息要 LMOVE 回 pending head；保留原順序（LEFT LEFT）。"""
    r.rpush(worker.QUEUE_PROCESSING, b"msg-a", b"msg-b")
    r.rpush(worker.QUEUE_PENDING, b"msg-c")

    swept = worker.startup_sweep(r)

    assert swept == 2
    # pending head 該是先撈的 msg-a (LEFT LEFT 保序)，msg-b 接著，msg-c 殿後
    assert r.lrange(worker.QUEUE_PENDING, 0, -1) == [b"msg-b", b"msg-a", b"msg-c"]
    assert r.llen(worker.QUEUE_PROCESSING) == 0


def test_startup_sweep_empty_processing_noop(r):
    assert worker.startup_sweep(r) == 0
    assert r.llen(worker.QUEUE_PENDING) == 0


# ── consume_once happy path ────────────────────────────────────────


def test_consume_once_happy_path_acks(r, fake_spawner, fake_http):
    msg = _make_msg()
    r.rpush(worker.QUEUE_PENDING, json.dumps(msg).encode())

    acked = worker.consume_once(r, fake_spawner, fake_http)

    assert acked is True
    assert r.llen(worker.QUEUE_PENDING) == 0
    assert r.llen(worker.QUEUE_PROCESSING) == 0   # LREM 砍掉了
    # callback 被打、payload 含 submission_id 跟 per_testcase
    fake_http.post.assert_called_once()
    call_kwargs = fake_http.post.call_args.kwargs
    assert call_kwargs["json"]["submission_id"] == "sub-1"
    assert len(call_kwargs["json"]["per_testcase"]) == 1
    assert call_kwargs["json"]["per_testcase"][0]["case_verdict"] == "AC"
    # X-Worker-Secret header 有帶
    assert call_kwargs["headers"]["X-Worker-Secret"] == "test-secret"


# ── consume_once exception 真值表（Step 9 / 判題失敗處理合約） ─────


def test_consume_once_spawner_error_sends_failure_callback_and_acks(r, fake_spawner, fake_http):
    """SpawnerError → failure callback (verdict=JudgeFailed) + ACK。

    Step 9 改動：原本 ACK + drop、現在改送 failure callback 讓 user 看到 JudgeFailed 狀態。
    """
    fake_spawner.run.side_effect = SpawnerError("docker daemon down")
    r.rpush(worker.QUEUE_PENDING, json.dumps(_make_msg()).encode())

    acked = worker.consume_once(r, fake_spawner, fake_http)

    assert acked is True
    assert r.llen(worker.QUEUE_PROCESSING) == 0
    fake_http.post.assert_called_once()
    payload = fake_http.post.call_args.kwargs["json"]
    assert payload["verdict"] == "JudgeFailed"
    assert "SpawnerError" in payload["failure_reason"]
    assert "docker daemon down" in payload["failure_reason"]


def test_consume_once_unexpected_exception_sends_failure_callback_and_acks(r, fake_spawner, fake_http):
    """KeyError 等 unexpected exception → failure callback + ACK（Step 9：不再 silent drop）。"""
    fake_spawner.run.side_effect = KeyError("uhoh")
    r.rpush(worker.QUEUE_PENDING, json.dumps(_make_msg()).encode())

    acked = worker.consume_once(r, fake_spawner, fake_http)

    assert acked is True
    assert r.llen(worker.QUEUE_PROCESSING) == 0
    fake_http.post.assert_called_once()
    payload = fake_http.post.call_args.kwargs["json"]
    assert payload["verdict"] == "JudgeFailed"
    assert "KeyError" in payload["failure_reason"]


def test_consume_once_fetch_source_failure_sends_judge_failed(r, fake_spawner, fake_http, monkeypatch):
    """L1 fetch_source 失敗（MinIO 連不上）→ failure callback (JudgeFailed) + ACK。"""
    def _broken_fetch(http, url):
        raise requests.ConnectionError("MinIO unreachable")
    monkeypatch.setattr(worker, "fetch_source", _broken_fetch)
    r.rpush(worker.QUEUE_PENDING, json.dumps(_make_msg()).encode())

    acked = worker.consume_once(r, fake_spawner, fake_http)

    assert acked is True
    assert r.llen(worker.QUEUE_PROCESSING) == 0
    payload = fake_http.post.call_args.kwargs["json"]
    assert payload["verdict"] == "JudgeFailed"
    assert "ConnectionError" in payload["failure_reason"]
    assert "MinIO unreachable" in payload["failure_reason"]
    # 應該沒呼叫 spawner.run（L1 就掛了、沒走到 L2）
    fake_spawner.run.assert_not_called()


def test_consume_once_run_only_acks_without_callback(r, fake_spawner, fake_http):
    """RUN_ONLY → ACK + 不送 callback（backend 應已 reject、worker 是 fallback）。"""
    msg = _make_msg(submission_type="RUN_ONLY")
    r.rpush(worker.QUEUE_PENDING, json.dumps(msg).encode())

    acked = worker.consume_once(r, fake_spawner, fake_http)

    assert acked is True
    assert r.llen(worker.QUEUE_PROCESSING) == 0
    fake_spawner.run.assert_not_called()
    fake_http.post.assert_not_called()


def test_consume_once_bad_json_acks_without_callback(r, fake_spawner, fake_http):
    """JSONDecodeError → ACK 丟掉、不送 callback（沒 submission_id 無從通知）。"""
    r.rpush(worker.QUEUE_PENDING, b"{not json")

    acked = worker.consume_once(r, fake_spawner, fake_http)

    assert acked is True
    assert r.llen(worker.QUEUE_PROCESSING) == 0
    fake_http.post.assert_not_called()


# ── callback retry (Step 9 §3b) ────────────────────────────────────


def test_callback_5xx_then_success_retries_and_acks(r, fake_spawner, fake_http):
    """第一次 5xx、第二次 200：retry 成功、ACK、post 被打 2 次。"""
    resp_500 = MagicMock(status_code=503, text="Service Unavailable")
    resp_200 = MagicMock(status_code=200, text="")
    fake_http.post.side_effect = [resp_500, resp_200]
    r.rpush(worker.QUEUE_PENDING, json.dumps(_make_msg()).encode())

    acked = worker.consume_once(r, fake_spawner, fake_http)

    assert acked is True
    assert fake_http.post.call_count == 2
    assert r.llen(worker.QUEUE_PROCESSING) == 0


def test_callback_5xx_5xx_logs_permanent_and_acks(r, fake_spawner, fake_http, caplog):
    """兩次都 5xx → log permanent failure 後 ACK、submission 維持 Pending（由 admin reconcile）。"""
    resp_500 = MagicMock(status_code=503, text="Service Unavailable")
    fake_http.post.side_effect = [resp_500, resp_500]
    r.rpush(worker.QUEUE_PENDING, json.dumps(_make_msg()).encode())

    with caplog.at_level("ERROR", logger="worker"):
        acked = worker.consume_once(r, fake_spawner, fake_http)

    assert acked is True
    assert fake_http.post.call_count == 2  # 初試 + 1 retry
    assert r.llen(worker.QUEUE_PROCESSING) == 0
    assert any("callback failed permanently" in rec.message for rec in caplog.records)


def test_callback_4xx_no_retry_and_acks(r, fake_spawner, fake_http, caplog):
    """4xx → 不 retry、log 後 ACK（retry 無意義、backend 永遠不會接受）。"""
    resp_422 = MagicMock(status_code=422, text='{"detail":"submission_id not found"}')
    fake_http.post.return_value = resp_422
    r.rpush(worker.QUEUE_PENDING, json.dumps(_make_msg()).encode())

    with caplog.at_level("ERROR", logger="worker"):
        acked = worker.consume_once(r, fake_spawner, fake_http)

    assert acked is True
    assert fake_http.post.call_count == 1   # 只試 1 次、不 retry
    assert r.llen(worker.QUEUE_PROCESSING) == 0
    assert any("callback rejected 4xx" in rec.message for rec in caplog.records)


def test_callback_connection_error_retries(r, fake_spawner, fake_http):
    """requests.ConnectionError → retry；第二次成功 → ACK。"""
    resp_200 = MagicMock(status_code=200, text="")
    fake_http.post.side_effect = [
        requests.ConnectionError("backend unreachable"),
        resp_200,
    ]
    r.rpush(worker.QUEUE_PENDING, json.dumps(_make_msg()).encode())

    acked = worker.consume_once(r, fake_spawner, fake_http)

    assert acked is True
    assert fake_http.post.call_count == 2
    assert r.llen(worker.QUEUE_PROCESSING) == 0


# ── run_official fail-fast ─────────────────────────────────────────


def test_run_official_all_ac(fake_spawner):
    testcases = [
        {"testcase_id": 1, "input_data": "1 2\n", "expected_output": "3\n", "is_sample": True},
        {"testcase_id": 2, "input_data": "5 7\n", "expected_output": "12\n", "is_sample": False},
    ]
    fake_spawner.run.side_effect = [
        _make_completed_run(stdout="3\n", duration=0.05),
        _make_completed_run(stdout="12\n", duration=0.07),
    ]

    per_tc, judge_log, max_exec_ms = worker.run_official(
        spawner=fake_spawner, source="x", language="python",
        testcases=testcases, time_limit_ms=1000, submission_id="sub-test",
    )

    assert [tc["case_verdict"] for tc in per_tc] == ["AC", "AC"]
    assert max_exec_ms == 70
    assert judge_log == ""


def test_run_official_fail_fast_breaks_on_wa(fake_spawner):
    testcases = [
        {"testcase_id": 1, "input_data": "1 2\n", "expected_output": "3\n", "is_sample": True},
        {"testcase_id": 2, "input_data": "5 7\n", "expected_output": "12\n", "is_sample": False},
        {"testcase_id": 3, "input_data": "9 1\n", "expected_output": "10\n", "is_sample": False},
    ]
    fake_spawner.run.side_effect = [
        _make_completed_run(stdout="3\n"),
        _make_completed_run(stdout="99\n"),   # WA
        _make_completed_run(stdout="10\n"),   # 不該跑到
    ]

    per_tc, _, _ = worker.run_official(
        spawner=fake_spawner, source="x", language="python",
        testcases=testcases, time_limit_ms=1000, submission_id="sub-test",
    )

    assert len(per_tc) == 2, "fail-fast 應該在 WA 那筆 break"
    assert [tc["case_verdict"] for tc in per_tc] == ["AC", "WA"]
    assert fake_spawner.run.call_count == 2


def test_run_official_passes_safety_margin_to_spawner(fake_spawner):
    testcases = [{"testcase_id": 1, "input_data": "", "expected_output": "", "is_sample": True}]
    worker.run_official(
        spawner=fake_spawner, source="x", language="python",
        testcases=testcases, time_limit_ms=1000, submission_id="sub-test",
    )

    kwargs = fake_spawner.run.call_args.kwargs
    expected_timeout = 1.0 + worker.SAFETY_MARGIN_SEC
    assert kwargs["timeout"] == pytest.approx(expected_timeout)


def test_run_official_stdin_is_testcase_input_not_source(fake_spawner):
    """Step 8 protocol：stdin = testcase input、source 走 source 參數。"""
    testcases = [{"testcase_id": 1, "input_data": "1 2\n", "expected_output": "3\n", "is_sample": True}]
    worker.run_official(
        spawner=fake_spawner, source="a, b = map(int, input().split())\nprint(a+b)\n",
        language="python", testcases=testcases, time_limit_ms=1000, submission_id="sub-test",
    )

    kwargs = fake_spawner.run.call_args.kwargs
    assert kwargs["stdin"] == "1 2\n"
    assert "input().split" in kwargs["source"]


# ── decide_case_verdict ─────────────────────────────────────────────


def test_decide_case_verdict_tle_beats_everything():
    result = _make_completed_run(stdout="", exit_code=-1, timed_out=True)
    assert worker.decide_case_verdict(result, "3\n", "python") == "TLE"


def test_decide_case_verdict_cpp_exit_100_is_ce():
    result = _make_completed_run(stdout="", exit_code=100)
    assert worker.decide_case_verdict(result, "anything", "cpp") == "CE"


def test_decide_case_verdict_python_exit_100_is_re():
    """exit 100 對 python 是 RE、不是 CE（python 沒編譯階段）。"""
    result = _make_completed_run(stdout="", exit_code=100)
    assert worker.decide_case_verdict(result, "anything", "python") == "RE"


def test_decide_case_verdict_nonzero_exit_is_re():
    result = _make_completed_run(stdout="", exit_code=1)
    assert worker.decide_case_verdict(result, "3\n", "python") == "RE"


def test_decide_case_verdict_stdout_mismatch_is_wa():
    result = _make_completed_run(stdout="4\n", exit_code=0)
    assert worker.decide_case_verdict(result, "3\n", "python") == "WA"


def test_decide_case_verdict_match_is_ac():
    result = _make_completed_run(stdout="3\n", exit_code=0)
    assert worker.decide_case_verdict(result, "3\n", "python") == "AC"


def test_decide_case_verdict_exit_137_is_mle():
    result = _make_completed_run(stdout="", exit_code=137)
    assert worker.decide_case_verdict(result, "anything", "python") == "MLE"
    assert worker.decide_case_verdict(result, "anything", "cpp") == "MLE"
