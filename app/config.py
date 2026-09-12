from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    APP_NAME: str = "Negotia AI API"
    ENVIRONMENT: str = "development"
    GEMINI_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    DATABASE_URL: str = "sqlite:///./negotia.db"
    FRONTEND_URL: str = "http://localhost:5173"
    UPLOAD_DIR: str = "./uploads"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

@lru_cache
def get_settings() -> Settings:
    return Settings()

settings = get_settings()

