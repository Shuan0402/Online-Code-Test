from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class Settings(BaseSettings):
    JWT_SECRET: str = Field(..., validation_alias="JWT_SECRET")
    CANDIDATE_PASSWORD_SHA_SECRET: str = Field(
        ...,
        validation_alias="CANDIDATE_PASSWORD_SHA_SECRET",
        description="批次建立考生時，依帳號產生預設密碼所用的 HMAC 密鑰",
    )
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    
    # 如果環境變數裡沒有特別指定，本機開發就預設用 5173。
    # 未來需要在正式伺服器的環境設定檔（.env）中加入 FRONTEND_HOST=https://<frontend_url>
    # Backend 在啟動時會自動使用 .env 的正式網址
    FRONTEND_HOST: str = "http://localhost:5173" 

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()