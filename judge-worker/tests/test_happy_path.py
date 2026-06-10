import sys
import os
import pathlib
import time
import httpx
import pytest
from unittest.mock import patch, MagicMock

# Read happy_path.py once to compile it
HAPPY_PATH_FILE = pathlib.Path(__file__).parent.parent.parent / "scripts" / "integration" / "happy_path.py"

with open(HAPPY_PATH_FILE, "r", encoding="utf-8") as f:
    HAPPY_PATH_CODE = f.read()

def run_happy_path_code(env_overrides, mock_post_side_effect=None, mock_get_side_effect=None, mock_time_side_effect=None):
    # Prepare global namespace for clean execution
    global_ns = {"__name__": "not_main"}
    code_obj = compile(HAPPY_PATH_CODE, str(HAPPY_PATH_FILE.resolve()), "exec")
    
    # Save original env and sys argv
    orig_env = dict(os.environ)
    os.environ.update(env_overrides)
    
    try:
        # Patch httpx (imported as requests in the script) and time
        with patch("httpx.post") as mock_post, \
             patch("httpx.get") as mock_get, \
             patch("time.sleep", return_value=None), \
             patch("time.time") as mock_time:
            
            if mock_post_side_effect:
                mock_post.side_effect = mock_post_side_effect
            if mock_get_side_effect:
                mock_get.side_effect = mock_get_side_effect
            if mock_time_side_effect:
                mock_time.side_effect = mock_time_side_effect
            else:
                mock_time.return_value = 100.0
            
            # Execute script to populate namespace
            exec(code_obj, global_ns)
            
            # Run the main function
            global_ns["main"]()
    finally:
        # Restore environment
        os.environ.clear()
        os.environ.update(orig_env)


def make_mock_response(status_code, json_data=None, text=None, method="POST", url="http://test"):
    request = httpx.Request(method, url)
    return httpx.Response(status_code, json=json_data, text=text, request=request)


def test_happy_path_missing_exam_id():
    # EXAM_ID is missing from environment overrides
    global_ns = {"__name__": "not_main"}
    code_obj = compile(HAPPY_PATH_CODE, str(HAPPY_PATH_FILE.resolve()), "exec")
    
    orig_env = dict(os.environ)
    if "EXAM_ID" in os.environ:
        del os.environ["EXAM_ID"]
        
    try:
        with pytest.raises(SystemExit) as excinfo:
            exec(code_obj, global_ns)
        assert "請先跑 seed.py" in str(excinfo.value)
    finally:
        os.environ.clear()
        os.environ.update(orig_env)


def test_happy_path_success_ac():
    # Mocking a successful run where status is "AC"
    resp_login = make_mock_response(200, json_data={"access_token": "mock-token", "role": "candidate"})
    resp_submit = make_mock_response(202, json_data={"id": "mock-sub-id"})
    resp_poll_ac = make_mock_response(200, json_data={"status": "AC", "score": 100, "execution_time": 10, "memory_usage": 5, "judge_log": "ok"}, method="GET")
    
    mock_post_side = [resp_login, resp_submit]
    mock_get_side = [resp_poll_ac]
    
    run_happy_path_code(
        env_overrides={"EXAM_ID": "mock-exam-uuid"},
        mock_post_side_effect=mock_post_side,
        mock_get_side_effect=mock_get_side
    )


def test_happy_path_submit_failure():
    # Mocking login success, but submit returns 500
    resp_login = make_mock_response(200, json_data={"access_token": "mock-token", "role": "candidate"})
    resp_submit_fail = make_mock_response(500, text="internal error")
    
    mock_post_side = [resp_login, resp_submit_fail]
    
    with pytest.raises(SystemExit) as excinfo:
        run_happy_path_code(
            env_overrides={"EXAM_ID": "mock-exam-uuid"},
            mock_post_side_effect=mock_post_side
        )
    assert excinfo.value.code == 1


def test_happy_path_poll_timeout():
    # Mocking login and submit success, but polling times out remaining "Pending"
    resp_login = make_mock_response(200, json_data={"access_token": "mock-token", "role": "candidate"})
    resp_submit = make_mock_response(202, json_data={"id": "mock-sub-id"})
    resp_poll_pending = make_mock_response(200, json_data={"status": "Pending"}, method="GET")
    
    mock_post_side = [resp_login, resp_submit]
    mock_get_side = [resp_poll_pending, resp_poll_pending]
    
    # Mocking time: starts at 100.0, next call is 200.0 (past the 30 sec limit)
    mock_time_side = [100.0, 101.0, 200.0]
    
    with pytest.raises(SystemExit) as excinfo:
        run_happy_path_code(
            env_overrides={"EXAM_ID": "mock-exam-uuid"},
            mock_post_side_effect=mock_post_side,
            mock_get_side_effect=mock_get_side,
            mock_time_side_effect=mock_time_side
        )
    assert excinfo.value.code == 2


def test_happy_path_non_ac_verdict():
    # Mocking a run where status is "WA" (Wrong Answer)
    resp_login = make_mock_response(200, json_data={"access_token": "mock-token", "role": "candidate"})
    resp_submit = make_mock_response(202, json_data={"id": "mock-sub-id"})
    resp_poll_wa = make_mock_response(200, json_data={"status": "WA", "score": 0, "execution_time": 10, "memory_usage": 5, "judge_log": "wrong answer"}, method="GET")
    
    mock_post_side = [resp_login, resp_submit]
    mock_get_side = [resp_poll_wa]
    
    with pytest.raises(SystemExit) as excinfo:
        run_happy_path_code(
            env_overrides={"EXAM_ID": "mock-exam-uuid"},
            mock_post_side_effect=mock_post_side,
            mock_get_side_effect=mock_get_side
        )
    assert excinfo.value.code == 3


def test_happy_path_direct_main():
    resp_login = make_mock_response(200, json_data={"access_token": "mock-token", "role": "candidate"})
    resp_submit = make_mock_response(202, json_data={"id": "mock-sub-id"})
    resp_poll_ac = make_mock_response(200, json_data={"status": "AC", "score": 100, "execution_time": 10, "memory_usage": 5, "judge_log": "ok"}, method="GET")
    
    mock_post_side = [resp_login, resp_submit]
    mock_get_side = [resp_poll_ac]
    
    global_ns = {"__name__": "__main__"}
    code_obj = compile(HAPPY_PATH_CODE, str(HAPPY_PATH_FILE.resolve()), "exec")
    
    orig_env = dict(os.environ)
    os.environ["EXAM_ID"] = "mock-exam-uuid"
    
    try:
        with patch("httpx.post") as mock_post, \
             patch("httpx.get") as mock_get, \
             patch("time.sleep", return_value=None), \
             patch("time.time") as mock_time:
            
            mock_post.side_effect = mock_post_side
            mock_get.side_effect = mock_get_side
            mock_time.return_value = 100.0
            
            exec(code_obj, global_ns)
    finally:
        os.environ.clear()
        os.environ.update(orig_env)

