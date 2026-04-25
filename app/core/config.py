from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import PostgresDsn, computed_field
from typing import Optional

class Settings(BaseSettings):
    # Application configuration
    PROJECT_NAME: str = "Askdoc API"
    VERSION: str = "0.1.0"
    
    # Postgres Database Configuration
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_DB: str = "askdoc_db"
    POSTGRES_PORT: int = 5432

    @computed_field
    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        # We are using asyncpg for async sqlalchemy
        return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    # App Settings
    MEDIA_DIR: str = "media"
    VECTOR_STORE_DIR: str = "vector_store"
    EMBEDDING_MODEL_NAME: str = "all-MiniLM-L6-v2"
    
    # Gemini (via OpenAI)
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_BASE_URL: str = "https://generativelanguage.googleapis.com/v1beta/openai/"

    # .env file configuration for pydantic-settings
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

settings = Settings()
