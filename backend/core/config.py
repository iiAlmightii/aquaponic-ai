"""
core/config.py — Application settings loaded from environment variables.
Uses pydantic-settings for type-safe, validated configuration.
"""

from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # ── App ──────────────────────────────────────────────────────────────────
    APP_NAME: str = "AquaponicAI"
    ENVIRONMENT: str = "development"          # development | staging | production
    DEBUG: bool = False
    SECRET_KEY: str = "CHANGE-ME-IN-PRODUCTION-USE-32-CHAR-RANDOM-STRING"

    # ── Database ─────────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://aquaponic:secret@localhost:5432/aquaponic_db"

    # ── Redis ─────────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"
    SESSION_TTL_SECONDS: int = 3600          # 1 hour session cache

    # ── JWT ───────────────────────────────────────────────────────────────────
    JWT_SECRET_KEY: str = "CHANGE-ME-JWT-SECRET"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── CORS ─────────────────────────────────────────────────────────────────
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "https://app.aquaponic.ai",
    ]

    # ── AI / LLM ─────────────────────────────────────────────────────────────
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    DEFAULT_LLM_PROVIDER: str = "anthropic"   # openai | anthropic | local

    # ── Speech-to-Text ────────────────────────────────────────────────────────
    STT_PROVIDER: str = "whisper"             # whisper | google | deepgram

    # ── Storage ───────────────────────────────────────────────────────────────
    STORAGE_BACKEND: str = "local"            # local | s3
    LOCAL_STORAGE_PATH: str = "./storage"
    S3_BUCKET: str = ""
    S3_REGION: str = "ap-south-1"
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""

    # ── External APIs ─────────────────────────────────────────────────────────
    WEATHER_API_KEY: str = ""
    WEATHER_API_URL: str = "https://api.openweathermap.org/data/2.5"
    MARKET_API_KEY: str = ""
    MARKET_API_URL: str = "https://api.commodityprices.io/v1"

    # ── Supabase ──────────────────────────────────────────────────────────────
    # Optional: use Supabase as PostgreSQL host.
    # When set, DATABASE_URL should point to the Supabase connection pooler URL.
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    # Supabase direct connection details (used by Looker Studio PostgreSQL connector)
    SUPABASE_DB_HOST: str = ""
    SUPABASE_DB_PORT: int = 5432
    SUPABASE_DB_NAME: str = "postgres"
    SUPABASE_DB_USER: str = "postgres"

    # ── Looker Studio ─────────────────────────────────────────────────────────
    # Pre-built Looker Studio report template connected to Supabase PostgreSQL.
    # Set LOOKER_STUDIO_REPORT_ID to a Google Data Studio report UUID.
    # The report must have a "session_id" filter control for per-session views.
    LOOKER_STUDIO_REPORT_ID: str = ""
    LOOKER_STUDIO_PAGE_ID: str = "p_page1"   # default first page ID

    # ── Evaluation ────────────────────────────────────────────────────────────
    EVAL_MODE: bool = False            # set true to enable /api/v1/eval/* endpoints
    SARVAM_API_KEY: str = ""           # required for AI Advisor and EVAL_MODE; get key at sarvam.ai
    SARVAM_CHAT_MODEL: str = "sarvam-m"   # Sarvam 30B chat completions model

    # ── Rate Limiting ─────────────────────────────────────────────────────────
    RATE_LIMIT_AUTH: str = "10/minute"
    RATE_LIMIT_API: str = "200/minute"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
