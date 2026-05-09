"""
Unit test：decide_verdict() pure function（worker.py）。

純 Python、不碰 docker，跑得超快。執行：
    cd judge-worker && python3 -m unittest tests.test_decide_verdict

或從 repo root：
    cd Online-Code-Test && python3 -m unittest discover -s judge-worker -t judge-worker

每加一個新 verdict 分支（e.g., 之後 step 加的 MLE / OLE）都要先在這裡加 test，
再去 worker.py 改邏輯——TDD 的小型實踐。
"""

import unittest

from spawner.base import CompletedRun
from worker import decide_verdict


def make_result(
    stdout: str = "",
    stderr: str = "",
    exit_code: int = 0,
    duration_sec: float = 0.1,
    timed_out: bool = False,
    oom_killed: bool = False,
    truncated_stdout: bool = False,
    truncated_stderr: bool = False,
) -> CompletedRun:
    """工廠函式——讓每個 test 只填它在意的欄位、其他取合理 default。"""
    return CompletedRun(
        stdout=stdout,
        stderr=stderr,
        exit_code=exit_code,
        duration_sec=duration_sec,
        timed_out=timed_out,
        oom_killed=oom_killed,
        truncated_stdout=truncated_stdout,
        truncated_stderr=truncated_stderr,
    )


def py_sub(expected: str = "4\n") -> dict:
    return {"language": "python", "expected_output": expected}


def cpp_sub(expected: str = "4\n") -> dict:
    return {"language": "cpp", "expected_output": expected}


class TestDecideVerdictBasic(unittest.TestCase):
    """5 個基本 verdict 各自的 happy path。"""

    def test_ac(self):
        result = make_result(stdout="4\n", exit_code=0)
        self.assertEqual(decide_verdict(result, py_sub("4\n")), "AC")

    def test_wa_wrong_output(self):
        result = make_result(stdout="5\n", exit_code=0)
        self.assertEqual(decide_verdict(result, py_sub("4\n")), "WA")

    def test_re_runtime_error(self):
        result = make_result(stdout="", stderr="Traceback...", exit_code=1)
        self.assertEqual(decide_verdict(result, py_sub()), "RE")

    def test_tle(self):
        result = make_result(stdout="", timed_out=True, exit_code=-1)
        self.assertEqual(decide_verdict(result, py_sub()), "TLE")

    def test_mle(self):
        result = make_result(stdout="", oom_killed=True, exit_code=137)
        self.assertEqual(decide_verdict(result, py_sub()), "MLE")


class TestDecideVerdictCEOnlyForCpp(unittest.TestCase):
    """exit_code=100 是 cpp 才有的 CE sentinel。"""

    def test_ce_for_cpp(self):
        result = make_result(exit_code=100, stderr="g++: compile error")
        self.assertEqual(decide_verdict(result, cpp_sub()), "CE")

    def test_python_exit_100_is_re_not_ce(self):
        # 對 python，exit 100 沒特殊意義 → 普通 RE
        result = make_result(exit_code=100)
        self.assertEqual(decide_verdict(result, py_sub()), "RE")


class TestDecideVerdictPrecedence(unittest.TestCase):
    """多個 fail 訊號同時觸發時，要正確判定 root cause。"""

    def test_mle_overrides_tle(self):
        """OOM kill + timed_out 同時 true → 主因是 memory，判 MLE 不是 TLE。"""
        result = make_result(oom_killed=True, timed_out=True, exit_code=137)
        self.assertEqual(decide_verdict(result, py_sub()), "MLE")

    def test_tle_overrides_re(self):
        """超時 + exit code 非 0 → 主因是 timeout，判 TLE 不是 RE。"""
        result = make_result(timed_out=True, exit_code=137)
        self.assertEqual(decide_verdict(result, py_sub()), "TLE")

    def test_oom_overrides_wa(self):
        """OOM 時 stdout 通常也對不上 expected，但要判 MLE 不是 WA。"""
        result = make_result(oom_killed=True, stdout="partial\n", exit_code=137)
        self.assertEqual(decide_verdict(result, py_sub("4\n")), "MLE")

    def test_tle_overrides_wa(self):
        """超時時 stdout 也對不上 expected，但要判 TLE 不是 WA。"""
        result = make_result(timed_out=True, stdout="partial\n", exit_code=-1)
        self.assertEqual(decide_verdict(result, py_sub("4\n")), "TLE")


class TestDecideVerdictEdge(unittest.TestCase):
    """邊界 case：空白嚴格、stderr 不影響 verdict 等。"""

    def test_wa_whitespace_strict(self):
        # stdout 多一個空白 → WA（嚴格匹配）
        result = make_result(stdout="4\n ", exit_code=0)
        self.assertEqual(decide_verdict(result, py_sub("4\n")), "WA")

    def test_wa_missing_newline(self):
        # stdout 少一個換行 → WA
        result = make_result(stdout="4", exit_code=0)
        self.assertEqual(decide_verdict(result, py_sub("4\n")), "WA")

    def test_ac_with_stderr(self):
        # 程式有印 stderr 但不影響 verdict（exit 0 + stdout 對 = AC）
        result = make_result(stdout="4\n", stderr="warning: foo", exit_code=0)
        self.assertEqual(decide_verdict(result, py_sub("4\n")), "AC")

    def test_ac_empty_expected_and_empty_stdout(self):
        # 題目沒 expected output、user code 也沒印 → AC
        result = make_result(stdout="", exit_code=0)
        self.assertEqual(decide_verdict(result, py_sub("")), "AC")


if __name__ == "__main__":
    unittest.main()
