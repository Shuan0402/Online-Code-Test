import sys
import pathlib
from io import StringIO
from unittest.mock import patch

def test_good_py(monkeypatch):
    # Setup inputs and capture outputs
    monkeypatch.setattr('sys.stdin', StringIO('3 4\n'))
    captured_stdout = StringIO()
    monkeypatch.setattr('sys.stdout', captured_stdout)
    
    # Path to good.py
    fixture_path = pathlib.Path(__file__).parent.parent.parent / "judge-sandbox" / "tests" / "fixtures" / "good.py"
    
    with open(fixture_path, "r", encoding="utf-8") as f:
        code_content = f.read()
    
    # Compile and execute under coverage tracking
    code_obj = compile(code_content, str(fixture_path.resolve()), 'exec')
    
    global_ns = {}
    exec(code_obj, global_ns)
    
    assert captured_stdout.getvalue().strip() == "7"
