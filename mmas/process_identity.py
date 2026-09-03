#!/usr/bin/env python3
"""Process-identity checks shared by MMAS control paths."""

from __future__ import annotations

import os
import subprocess
from datetime import datetime

PROCESS_START_TOLERANCE_SEC = 5


def process_alive(pid: int | None) -> bool:
    if not pid:
        return False
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def verify_pid_started_at(pid: int | None, expected_started_at: str | None) -> tuple[bool, str]:
    """Return whether a live PID still matches persisted worker identity evidence.

    Historical boulders without ``started_at`` retain PID-only compatibility. Once
    identity evidence is present, malformed or unverifiable evidence fails closed.
    """
    if not pid:
        return False, "no recorded pid"
    if not process_alive(pid):
        return False, "process is not running"
    if not expected_started_at:
        return True, "legacy pid-only identity"

    try:
        expected_epoch = datetime.fromisoformat(expected_started_at.replace("Z", "+00:00")).timestamp()
    except (TypeError, ValueError):
        return False, "identity evidence is malformed; refusing to signal"

    try:
        result = subprocess.run(
            ["ps", "-o", "lstart=", "-p", str(pid)],
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError:
        return False, "process start time could not be resolved; refusing to signal"

    started = result.stdout.strip()
    if result.returncode != 0 or not started:
        return False, "process start time could not be resolved; refusing to signal"

    try:
        actual_epoch = datetime.strptime(
            " ".join(started.split()), "%a %b %d %H:%M:%S %Y"
        ).astimezone().timestamp()
    except ValueError:
        return False, "process start time could not be parsed; refusing to signal"

    if abs(actual_epoch - expected_epoch) > PROCESS_START_TOLERANCE_SEC:
        return False, "process identity does not match persisted started_at; refusing to signal"
    return True, "identity verified"
