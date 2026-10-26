"""
Tests verifying the on-call-engineer directory, script entrypoints,
alert polling behavior, and integration with the observability stack.
"""

import subprocess
import sys
from pathlib import Path

import pytest

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent.parent
ON_CALL_DIR = WORKSPACE_ROOT / "on-call-engineer"


def test_on_call_engineer_directory_and_files_exist():
    """Verify on-call-engineer directory exists with all expected scripts and assets."""
    assert ON_CALL_DIR.exists() and ON_CALL_DIR.is_dir(), "on-call-engineer/ directory must exist"

    expected_files = [
        "monitor.py",
        "poller.py",
        "agent_dispatcher.py",
        "config.py",
        "README.md",
        "run.sh",
        "run.bat",
    ]
    for filename in expected_files:
        filepath = ON_CALL_DIR / filename
        assert filepath.exists(), f"Expected {filename} in on-call-engineer/"


def test_on_call_monitor_cli_help():
    """Verify python on-call-engineer/monitor.py --help executes cleanly."""
    script_path = ON_CALL_DIR / "monitor.py"
    proc = subprocess.run(
        [sys.executable, str(script_path), "--help"],
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert proc.returncode == 0
    assert "On-Call Engineer: Polls observability alert API" in proc.stdout
    assert "--alert-url" in proc.stdout
    assert "--interval" in proc.stdout
    assert "--agent-cmd" in proc.stdout
    assert "--dry-run" in proc.stdout
    assert "--once" in proc.stdout


def test_on_call_monitor_single_poll_execution():
    """Verify python on-call-engineer/monitor.py --once runs a single cycle successfully."""
    script_path = ON_CALL_DIR / "monitor.py"
    proc = subprocess.run(
        [sys.executable, str(script_path), "--once", "--dry-run"],
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert proc.returncode == 0
    assert "Running single on-call poll cycle" in proc.stdout or "Running single on-call poll cycle" in proc.stderr
    assert "Single poll completed" in proc.stdout or "Single poll completed" in proc.stderr
