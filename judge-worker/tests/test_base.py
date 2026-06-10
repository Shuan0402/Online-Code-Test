"""
Tests for spawner/base.py.
Verifies the ABC contract of SandboxSpawner, the immutability of CompletedRun, and SpawnerError exceptions.
"""

from dataclasses import FrozenInstanceError
import pytest

from spawner.base import SandboxSpawner, CompletedRun, SpawnerError


def test_spawner_error_is_exception():
    """SpawnerError should be raiseable and catchable as an Exception."""
    with pytest.raises(SpawnerError) as exc_info:
        raise SpawnerError("Docker daemon disconnected")
    assert str(exc_info.value) == "Docker daemon disconnected"
    assert isinstance(exc_info.value, Exception)


def test_completed_run_is_frozen():
    """CompletedRun is a frozen dataclass; its fields should be read-only and immutable."""
    run = CompletedRun(
        stdout="hello\n",
        stderr="",
        exit_code=0,
        duration_sec=0.15,
        timed_out=False
    )
    
    assert run.stdout == "hello\n"
    assert run.stderr == ""
    assert run.exit_code == 0
    assert run.duration_sec == 0.15
    assert run.timed_out is False

    # Modifying fields should raise FrozenInstanceError
    with pytest.raises(FrozenInstanceError):
        run.stdout = "modified"  # type: ignore[misc]

    with pytest.raises(FrozenInstanceError):
        run.timed_out = True  # type: ignore[misc]


def test_sandbox_spawner_is_abstract():
    """SandboxSpawner is an abstract class and cannot be instantiated directly."""
    with pytest.raises(TypeError) as exc_info:
        SandboxSpawner()  # type: ignore[abstract]
    assert "Can't instantiate abstract class SandboxSpawner" in str(exc_info.value)


def test_sandbox_spawner_subclass_without_run_raises_type_error():
    """Subclassing SandboxSpawner without implementing the run method should raise TypeError on instantiation."""
    class IncompleteSpawner(SandboxSpawner):
        pass

    with pytest.raises(TypeError) as exc_info:
        IncompleteSpawner()  # type: ignore[abstract]
    assert "Can't instantiate abstract class IncompleteSpawner" in str(exc_info.value)


def test_sandbox_spawner_concrete_subclass_instantiation():
    """Concrete subclasses implementing the run method should instantiate successfully."""
    class ConcreteSpawner(SandboxSpawner):
        def run(self, image: str, source: str, source_filename: str, stdin: str, timeout: int) -> CompletedRun:
            return CompletedRun(
                stdout=f"Ran {image} with source {source_filename}",
                stderr="",
                exit_code=0,
                duration_sec=0.1,
                timed_out=False
            )

    spawner = ConcreteSpawner()
    result = spawner.run("sandbox:python", "print(1)", "source.py", "", 5)
    
    assert result.stdout == "Ran sandbox:python with source source.py"
    assert result.exit_code == 0
    assert result.timed_out is False
