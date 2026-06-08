"""
DockerSpawner unit tests — 不碰真實 docker。

Mock subprocess.run，驗 Step 8 sandbox protocol：
  1. source code 寫進 host tempdir 的指定檔名
  2. docker run cmd 含 -v <tempdir>:/sandbox:ro
  3. stdin 餵 subprocess input（= testcase input、不是 source）
  4. tempdir 跑完 finally 清掉（成功 & timeout 兩條路）
  5. timeout 觸發 docker kill
"""

import subprocess
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from spawner.docker_spawner import DockerSpawner


# ── helpers ────────────────────────────────────────────────────────


def _make_proc_result(stdout="", stderr="", returncode=0):
    m = MagicMock()
    m.stdout = stdout
    m.stderr = stderr
    m.returncode = returncode
    return m


def _extract_mount_target(cmd: list[str]) -> str:
    """從 docker run cmd 抽 -v 後面那段 (host:container[:opts])。"""
    for i, tok in enumerate(cmd):
        if tok == "-v":
            return cmd[i + 1]
    raise AssertionError(f"-v not found in cmd: {cmd}")


# ── tests ──────────────────────────────────────────────────────────


def test_source_written_to_tempdir_with_correct_filename():
    """source code 必須以指定檔名 (source.py) 寫進 host tempdir、worker 端讀得到。"""
    captured = {}

    def fake_run(cmd, **kwargs):
        # docker run 觸發時 source 應該已經寫到 tempdir
        mount = _extract_mount_target(cmd)
        host_dir = mount.rsplit(":/sandbox", 1)[0]
        source_path = Path(host_dir) / "source.py"
        captured["exists"] = source_path.exists()
        captured["content"] = source_path.read_text() if source_path.exists() else None
        return _make_proc_result(stdout="hello\n")

    with patch("subprocess.run", side_effect=fake_run):
        DockerSpawner().run(
            image="sandbox:python",
            source="print('hello')\n",
            source_filename="source.py",
            stdin="",
            timeout=5,
        )

    assert captured["exists"] is True
    assert captured["content"] == "print('hello')\n"


def test_docker_run_cmd_mounts_tempdir_readonly():
    """docker run 必須有 -v <host>:/sandbox:ro。"""
    captured_cmd = {}

    def fake_run(cmd, **kwargs):
        captured_cmd["cmd"] = cmd
        return _make_proc_result()

    with patch("subprocess.run", side_effect=fake_run):
        DockerSpawner().run(
            image="sandbox:python",
            source="x = 1\n",
            source_filename="source.py",
            stdin="",
            timeout=5,
        )

    mount = _extract_mount_target(captured_cmd["cmd"])
    assert mount.endswith(":/sandbox:ro"), f"mount must be readonly /sandbox: {mount}"


def test_stdin_is_testcase_input_not_source():
    """stdin 參數要走 subprocess.run(input=...)、跟 source 完全分離。

    這是 Step 6 → Step 8 protocol 換的核心：stdin 不再是 source。
    """
    captured_kwargs = {}

    def fake_run(cmd, **kwargs):
        captured_kwargs.update(kwargs)
        return _make_proc_result(stdout="3\n")

    with patch("subprocess.run", side_effect=fake_run):
        DockerSpawner().run(
            image="sandbox:python",
            source="a, b = map(int, input().split())\nprint(a + b)\n",
            source_filename="source.py",
            stdin="1 2\n",
            timeout=5,
        )

    assert captured_kwargs["input"] == "1 2\n"
    # source code 不應該漏進 stdin
    assert "input().split" not in captured_kwargs["input"]


def test_tempdir_cleaned_up_on_success():
    """跑完成功 finally rmtree tempdir、host 不留垃圾。"""
    seen_dir = {}

    def fake_run(cmd, **kwargs):
        mount = _extract_mount_target(cmd)
        seen_dir["host"] = mount.rsplit(":/sandbox", 1)[0]
        return _make_proc_result()

    with patch("subprocess.run", side_effect=fake_run):
        DockerSpawner().run(
            image="sandbox:python",
            source="x = 1\n",
            source_filename="source.py",
            stdin="",
            timeout=5,
        )

    assert not Path(seen_dir["host"]).exists(), "tempdir 跑完要清掉"


def test_tempdir_cleaned_up_on_timeout():
    """TimeoutExpired 路徑也要清 tempdir（finally）。"""
    seen_dir = {}
    call_count = {"n": 0}

    def fake_run(cmd, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 1:
            # 第一次：docker run、丟 TimeoutExpired
            mount = _extract_mount_target(cmd)
            seen_dir["host"] = mount.rsplit(":/sandbox", 1)[0]
            raise subprocess.TimeoutExpired(cmd=cmd, timeout=2)
        # 第二次：docker kill、靜默通過
        return _make_proc_result()

    with patch("subprocess.run", side_effect=fake_run):
        result = DockerSpawner().run(
            image="sandbox:python",
            source="while True: pass\n",
            source_filename="source.py",
            stdin="",
            timeout=2,
        )

    assert result.timed_out is True
    assert not Path(seen_dir["host"]).exists(), "timeout 後 tempdir 也要清"


def test_timeout_triggers_docker_kill():
    """TimeoutExpired 後要 docker kill <container_name> 清 orphan。"""
    calls = []
    call_count = {"n": 0}

    def fake_run(cmd, **kwargs):
        calls.append(cmd)
        call_count["n"] += 1
        if call_count["n"] == 1:
            raise subprocess.TimeoutExpired(cmd=cmd, timeout=2)
        return _make_proc_result()

    with patch("subprocess.run", side_effect=fake_run):
        DockerSpawner().run(
            image="sandbox:python",
            source="while True: pass\n",
            source_filename="source.py",
            stdin="",
            timeout=2,
        )

    assert len(calls) == 2, f"expect 2 subprocess calls (run + kill), got {len(calls)}"
    assert calls[1][:2] == ["docker", "kill"]
    # docker run 的 --name 與 docker kill 的 target 要對得起來
    run_name = calls[0][calls[0].index("--name") + 1]
    kill_target = calls[1][2]
    assert run_name == kill_target


def test_completed_run_carries_subprocess_fields():
    """CompletedRun.stdout/stderr/exit_code 來自 subprocess.run 回傳。"""
    with patch(
        "subprocess.run",
        return_value=_make_proc_result(stdout="hi\n", stderr="warn\n", returncode=7),
    ):
        result = DockerSpawner().run(
            image="sandbox:python",
            source="print('hi')\n",
            source_filename="source.py",
            stdin="",
            timeout=5,
        )

    assert result.stdout == "hi\n"
    assert result.stderr == "warn\n"
    assert result.exit_code == 7
    assert result.timed_out is False
    assert result.duration_sec >= 0


def test_container_name_unique_per_call():
    """連跑兩次、container --name 不能撞、避免 docker kill 殺錯容器。"""
    names = []

    def fake_run(cmd, **kwargs):
        if cmd[:2] == ["docker", "run"]:
            names.append(cmd[cmd.index("--name") + 1])
        return _make_proc_result()

    with patch("subprocess.run", side_effect=fake_run):
        sp = DockerSpawner()
        sp.run(image="sandbox:python", source="x=1\n", source_filename="source.py", stdin="", timeout=5)
        sp.run(image="sandbox:python", source="x=2\n", source_filename="source.py", stdin="", timeout=5)

    assert len(set(names)) == 2, f"container names must differ, got {names}"


def test_cpp_uses_source_cpp_filename():
    """cpp 路徑 source_filename = source.cpp、不是 main.cpp（image entrypoint 對齊）。"""
    captured = {}

    def fake_run(cmd, **kwargs):
        mount = _extract_mount_target(cmd)
        host_dir = mount.rsplit(":/sandbox", 1)[0]
        captured["files"] = sorted(p.name for p in Path(host_dir).iterdir())
        return _make_proc_result()

    with patch("subprocess.run", side_effect=fake_run):
        DockerSpawner().run(
            image="sandbox:cpp",
            source="int main(){return 0;}\n",
            source_filename="source.cpp",
            stdin="",
            timeout=5,
        )

    assert captured["files"] == ["source.cpp"]
