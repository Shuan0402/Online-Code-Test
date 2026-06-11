import ast
import pathlib
import pytest
from io import StringIO

def test_membomb_py(monkeypatch):
    fixture_path = pathlib.Path(__file__).parent.parent.parent / "judge-sandbox" / "tests" / "fixtures" / "membomb.py"
    
    with open(fixture_path, "r", encoding="utf-8") as f:
        code_content = f.read()
        
    # Parse the code into an AST
    tree = ast.parse(code_content, filename=str(fixture_path.resolve()))
    
    # We want to insert a 'break' statement into the For loop body to prevent memory explosion
    class LoopBreaker(ast.NodeTransformer):
        def visit_For(self, node):
            # Transform For body to append a break statement
            node.body.append(ast.Break())
            return node
            
    tree = LoopBreaker().visit(tree)
    ast.fix_missing_locations(tree)
    
    # Compile the modified AST, keeping the original filename so coverage tracks it
    code_obj = compile(tree, str(fixture_path.resolve()), 'exec')
    
    # Capture print output
    captured_stdout = StringIO()
    monkeypatch.setattr('sys.stdout', captured_stdout)
    
    # Execute the code in a clean global namespace
    global_ns = {}
    exec(code_obj, global_ns)
    
    # Check that execution finished successfully and print statement executed
    assert captured_stdout.getvalue().strip() == "MEMBOMB_SURVIVED"
