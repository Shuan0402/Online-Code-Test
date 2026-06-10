import os
import subprocess
import tempfile
import unittest
from pathlib import Path


class TestGoodCppFixture(unittest.TestCase):
    def test_good_cpp_compiles_and_outputs_7(self):
        fixture_dir = Path(__file__).resolve().parent / "fixtures"
        source_path = fixture_dir / "good.cpp"
        self.assertTrue(source_path.exists(), f"Expected fixture source at {source_path}")

        with tempfile.TemporaryDirectory() as tmpdir:
            binary_path = Path(tmpdir) / "good_cpp_test.exe"
            compile_proc = subprocess.run(
                [
                    "g++",
                    "-std=c++17",
                    "-O2",
                    str(source_path),
                    "-o",
                    str(binary_path),
                ],
                capture_output=True,
                text=True,
            )
            self.assertEqual(
                compile_proc.returncode,
                0,
                msg=f"Compilation failed:\nSTDOUT:\n{compile_proc.stdout}\nSTDERR:\n{compile_proc.stderr}",
            )
            self.assertTrue(binary_path.exists(), "Compiled binary was not created")

            run_proc = subprocess.run(
                [str(binary_path)],
                input="3 4\n",
                capture_output=True,
                text=True,
            )
            self.assertEqual(run_proc.returncode, 0, msg=f"Execution failed: {run_proc.stderr}")
            self.assertEqual(run_proc.stdout.strip(), "7")


if __name__ == "__main__":
    unittest.main()
