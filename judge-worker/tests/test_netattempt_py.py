import pathlib
import socket
from io import StringIO
import pytest

def test_netattempt_py(monkeypatch):
    fixture_path = pathlib.Path(__file__).parent.parent.parent / "judge-sandbox" / "tests" / "fixtures" / "netattempt.py"
    
    with open(fixture_path, "r", encoding="utf-8") as f:
        code_content = f.read()
    
    code_obj = compile(code_content, str(fixture_path.resolve()), 'exec')
    
    # 1. Test scenario where connection succeeds (NETWORK_REACHABLE)
    captured_stdout_reachable = StringIO()
    def mock_create_connection_success(address, timeout=None, source_address=None):
        return object()  # Return some dummy connection object

    # We patch socket.create_connection using monkeypatch
    monkeypatch.setattr(socket, "create_connection", mock_create_connection_success)
    monkeypatch.setattr('sys.stdout', captured_stdout_reachable)
    
    global_ns_reachable = {}
    exec(code_obj, global_ns_reachable)
    assert captured_stdout_reachable.getvalue().strip() == "NETWORK_REACHABLE"
    
    # 2. Test scenario where connection fails (NETWORK_BLOCKED)
    captured_stdout_blocked = StringIO()
    def mock_create_connection_failure(address, timeout=None, source_address=None):
        raise OSError("Connection blocked")

    monkeypatch.setattr(socket, "create_connection", mock_create_connection_failure)
    monkeypatch.setattr('sys.stdout', captured_stdout_blocked)
    
    global_ns_blocked = {}
    exec(code_obj, global_ns_blocked)
    assert captured_stdout_blocked.getvalue().strip() == "NETWORK_BLOCKED"
