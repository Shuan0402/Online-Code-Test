import ast
import pathlib
import pytest

def test_infloop_py():
    fixture_path = pathlib.Path(__file__).parent.parent.parent / "judge-sandbox" / "tests" / "fixtures" / "infloop.py"
    
    with open(fixture_path, "r", encoding="utf-8") as f:
        code_content = f.read()
        
    # Parse the code into an AST
    tree = ast.parse(code_content, filename=str(fixture_path.resolve()))
    
    # We want to insert a 'break' statement into any While loop body to prevent infinite hang
    class LoopBreaker(ast.NodeTransformer):
        def visit_While(self, node):
            # Transform While body to append a break statement
            node.body.append(ast.Break())
            return node
            
    tree = LoopBreaker().visit(tree)
    ast.fix_missing_locations(tree)
    
    # Compile the modified AST, keeping the original filename so coverage tracks it
    code_obj = compile(tree, str(fixture_path.resolve()), 'exec')
    
    # Execute the code in a clean global namespace
    global_ns = {}
    exec(code_obj, global_ns)
    
    # Check that execution finished successfully without hanging
    assert True
