from unittest.mock import patch, MagicMock
import subprocess
import pytest

from worker_naive import (
    _decode_output,
    _decide_verdict,
    post_callback,
    judge,
    main
)


def test_decode_output():
    assert _decode_output(None) == ""
    assert _decode_output(b"hello") == "hello"
    assert _decode_output("hello") == "hello"


def test_decide_verdict():
    # TLE
    assert _decide_verdict(timed_out=True, exit_code=0, stdout="", sub={}) == "TLE"
    # CE
    assert _decide_verdict(timed_out=False, exit_code=100, stdout="", sub={"language": "cpp"}) == "CE"
    # RE
    assert _decide_verdict(timed_out=False, exit_code=1, stdout="", sub={"language": "python"}) == "RE"
    assert _decide_verdict(timed_out=False, exit_code=100, stdout="", sub={"language": "python"}) == "RE"
    # WA
    assert _decide_verdict(timed_out=False, exit_code=0, stdout="5\n", sub={"expected_output": "4\n"}) == "WA"
    # AC
    assert _decide_verdict(timed_out=False, exit_code=0, stdout="4\n", sub={"expected_output": "4\n"}) == "AC"


def test_post_callback(capsys):
    post_callback("s1", "AC")
    captured = capsys.readouterr()
    assert "[callback] id=s1 verdict=AC" in captured.out


@patch("subprocess.run")
def test_judge_success(mock_run, capsys):
    mock_proc = MagicMock()
    mock_proc.stdout = "4\n"
    mock_proc.stderr = "some_error"
    mock_proc.returncode = 0
    mock_run.return_value = mock_proc

    sub = {
        "id": "s1-py-ac",
        "language": "python",
        "source_code": "print(2 + 2)\n",
        "expected_output": "4\n",
        "timeout_sec": 5,
    }

    judge(sub)

    captured = capsys.readouterr()
    assert "[judge] id=s1-py-ac     verdict=AC exit=0" in captured.out
    assert "stdout='4\\n'" in captured.out
    assert "stderr='some_error'" in captured.out
    mock_run.assert_called_once_with(
        ["docker", "run", "--rm", "-i", "sandbox:python"],
        input="print(2 + 2)\n",
        capture_output=True,
        text=True,
        timeout=5,
    )


@patch("subprocess.run")
def test_judge_timeout(mock_run, capsys):
    # Raise subprocess.TimeoutExpired
    mock_run.side_effect = subprocess.TimeoutExpired(
        cmd=["docker", "run"],
        timeout=2,
        output=b"partial_out",
        stderr=None
    )

    sub = {
        "id": "s3-py-tle",
        "language": "python",
        "source_code": "while True:\n    pass\n",
        "expected_output": "",
        "timeout_sec": 2,
    }

    judge(sub)

    captured = capsys.readouterr()
    assert "[judge] id=s3-py-tle    verdict=TLE exit=-1" in captured.out
    assert "stdout='partial_out'" in captured.out


@patch("subprocess.run")
def test_main(mock_run, capsys):
    mock_proc = MagicMock()
    mock_proc.stdout = "4\n"
    mock_proc.stderr = ""
    mock_proc.returncode = 0
    mock_run.return_value = mock_proc

    main()

    captured = capsys.readouterr()
    assert "=== judge worker (naive / anti-pattern) ===" in captured.out
    assert mock_run.call_count == 4


@patch("subprocess.run")
def test_run_as_main(mock_run, capsys):
    import runpy
    mock_proc = MagicMock()
    mock_proc.stdout = "4\n"
    mock_proc.stderr = ""
    mock_proc.returncode = 0
    mock_run.return_value = mock_proc

    # Execute worker_naive.py as __main__ using runpy
    runpy.run_path("worker_naive.py", run_name="__main__")

    # Assert that subprocess.run was called for each submission in SUBMISSIONS
    assert mock_run.call_count == 4
