#!/usr/bin/env bash
# Verify that a problem was persisted with the expected one-to-many test_cases
# wiring (Q-1.1: 多測資結構化寫入).
#
# Asserts:
#   1. problems row with the given title exists
#   2. its time_limit_ms matches the expected value
#   3. its memory_limit_mb matches the expected value
#   4. test_cases rows where problem_id = problems.id has the expected count
#
# Usage: ./verify-problem-testcases.sh <title> <expected_testcase_count> <expected_time_limit_ms> <expected_memory_limit_mb>
# Exit:  0 OK; 1 mismatch; 2 problem not found.
set -euo pipefail

TITLE="${1:?usage: verify-problem-testcases.sh <title> <count> <time_limit_ms> <memory_limit_mb>}"
EXPECTED_COUNT="${2:?usage: verify-problem-testcases.sh <title> <count> <time_limit_ms> <memory_limit_mb>}"
EXPECTED_TIME_LIMIT="${3:?usage: verify-problem-testcases.sh <title> <count> <time_limit_ms> <memory_limit_mb>}"
EXPECTED_MEMORY_LIMIT="${4:?usage: verify-problem-testcases.sh <title> <count> <time_limit_ms> <memory_limit_mb>}"

docker compose exec -T backend python - \
    "$TITLE" "$EXPECTED_COUNT" "$EXPECTED_TIME_LIMIT" "$EXPECTED_MEMORY_LIMIT" <<'PY'
import sys
from app.db.session import SessionLocal
from app.models.problem import Problem
from app.models.testcase import TestCase

title, expected_count_s, expected_tl_s, expected_mem_s = sys.argv[1:5]
expected_count = int(expected_count_s)
expected_tl = int(expected_tl_s)
expected_mem = int(expected_mem_s)

db = SessionLocal()
try:
    p = db.query(Problem).filter(Problem.title == title).first()
    if p is None:
        print(f"[FAIL] problem not found: {title}", file=sys.stderr)
        sys.exit(2)

    if p.time_limit_ms != expected_tl:
        print(
            f"[FAIL] time_limit_ms mismatch: expected={expected_tl} got={p.time_limit_ms}",
            file=sys.stderr,
        )
        sys.exit(1)

    if p.memory_limit_mb != expected_mem:
        print(
            f"[FAIL] memory_limit_mb mismatch: expected={expected_mem} got={p.memory_limit_mb}",
            file=sys.stderr,
        )
        sys.exit(1)

    tc_count = db.query(TestCase).filter(TestCase.problem_id == p.id).count()
    if tc_count != expected_count:
        print(
            f"[FAIL] testcase count mismatch: expected={expected_count} got={tc_count}",
            file=sys.stderr,
        )
        sys.exit(1)

    print(
        f"[OK] problem id={p.id} '{title}' 寫入 {tc_count} 筆 testcase，"
        f"time_limit_ms={p.time_limit_ms} memory_limit_mb={p.memory_limit_mb}"
    )
finally:
    db.close()
PY
