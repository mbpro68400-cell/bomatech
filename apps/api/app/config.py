"""Application configuration — loaded from env vars."""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed settings. All values come from env vars (or .env for local dev)."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )

    # Supabase
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_JWT_SECRET: str = ""

    # Direct Postgres (optional, for heavy queries)
    DATABASE_URL: str = ""

    # LLM
    ANTHROPIC_API_KEY: str = ""

    # OCR
    MISTRAL_API_KEY: str = ""

    # Banking (Bridge)
    BRIDGE_CLIENT_ID: str = ""
    BRIDGE_CLIENT_SECRET: str = ""
    BRIDGE_API_URL: str = "https://api.bridgeapi.io/v3"

    # App
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"
    CORS_ORIGINS: str = "http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
