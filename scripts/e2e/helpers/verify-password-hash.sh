#!/usr/bin/env bash
# Verify that a user's stored password is correctly hashed (I-1.1).
#
# Asserts BOTH:
#   1. users.password_hash != the plaintext password (i.e. not stored as cleartext)
#   2. SecurityManager.verify_password(plaintext, hash) == True
#      (i.e. the hash actually corresponds to the password)
#
# Usage: ./verify-password-hash.sh <username> <plaintext>
# Exit:  0 OK; 1 fail; 2 user not found.
set -euo pipefail

USERNAME="${1:?usage: verify-password-hash.sh <username> <plaintext>}"
PLAINTEXT="${2:?usage: verify-password-hash.sh <username> <plaintext>}"

# Hand off to a python one-liner inside the backend container so we use
# the same SecurityManager the API used to write the hash.
docker compose exec -T backend python - "$USERNAME" "$PLAINTEXT" <<'PY'
import sys
from app.db.session import SessionLocal
from app.models.user import User
from app.core.security import SecurityManager

username, plaintext = sys.argv[1], sys.argv[2]
db = SessionLocal()
try:
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        print(f"[FAIL] user not found: {username}", file=sys.stderr)
        sys.exit(2)
    if user.password_hash == plaintext:
        print(f"[FAIL] password_hash 是明文：{user.password_hash!r}", file=sys.stderr)
        sys.exit(1)
    if not SecurityManager.verify_password(plaintext, user.password_hash):
        print(f"[FAIL] verify_password 為 False，hash 不對應明文", file=sys.stderr)
        sys.exit(1)
    print(f"[OK] {username} 密碼有 hash 且 verify_password 通過")
finally:
    db.close()
PY
