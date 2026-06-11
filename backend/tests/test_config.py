import pytest
from pydantic import ValidationError
from app.core.config import Settings, settings


def test_settings_default_values():
    """
    驗證當僅提供 JWT_SECRET 時，其餘配置能正確帶入預設值。
    """
    s = Settings(
        JWT_SECRET="my-super-secret-key",
        CANDIDATE_PASSWORD_SHA_SECRET="my-batch-secret",
    )
    
    assert s.JWT_SECRET == "my-super-secret-key"
    assert s.ALGORITHM == "HS256"
    assert s.ACCESS_TOKEN_EXPIRE_MINUTES == 60 * 24
    assert s.FRONTEND_HOST == "http://localhost:5173"


def test_settings_validation_fails_when_jwt_secret_missing(monkeypatch):
    """
    驗證若環境變數中無 JWT_SECRET，且未於初始化參數中傳入時，會拋出 ValidationError。
    """
    # 清理環境變數，避免讀取到系統或 CI 本身帶有的 JWT_SECRET
    monkeypatch.delenv("JWT_SECRET", raising=False)

    with pytest.raises(ValidationError) as exc_info:
        Settings()
    
    assert "JWT_SECRET" in str(exc_info.value)
    assert "Field required" in str(exc_info.value)


def test_settings_custom_overrides():
    """
    驗證可手動傳入參數或透過環境變數覆蓋預設值。
    """
    s = Settings(
        JWT_SECRET="custom-secret",
        CANDIDATE_PASSWORD_SHA_SECRET="custom-batch-secret",
        ALGORITHM="HS512",
        ACCESS_TOKEN_EXPIRE_MINUTES=120,
        FRONTEND_HOST="https://my-frontend.domain.tw"
    )
    
    assert s.JWT_SECRET == "custom-secret"
    assert s.ALGORITHM == "HS512"
    assert s.ACCESS_TOKEN_EXPIRE_MINUTES == 120
    assert s.FRONTEND_HOST == "https://my-frontend.domain.tw"


def test_global_settings_instance_is_loaded():
    """
    驗證全域 settings 實例已成功加載，且具備必要的 JWT_SECRET。
    """
    assert settings is not None
    assert isinstance(settings, Settings)
    assert settings.JWT_SECRET is not None
    assert len(settings.JWT_SECRET) > 0
