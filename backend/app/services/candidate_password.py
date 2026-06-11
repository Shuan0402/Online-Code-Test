import hashlib
import hmac
import string

from app.core.config import settings

_ALNUM = string.ascii_letters + string.digits


def generate_candidate_password(username: str) -> str:
    """依帳號與密鑰產生 8 位英數字密碼（HMAC-SHA256）。"""
    digest = hmac.new(
        settings.CANDIDATE_PASSWORD_SHA_SECRET.encode("utf-8"),
        username.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return "".join(_ALNUM[b % len(_ALNUM)] for b in digest[:8])
