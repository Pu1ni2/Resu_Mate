"""Configuration settings for the application"""
import os
import warnings
from pydantic_settings import BaseSettings
from typing import List

_DEFAULT_SECRET = "change-me-in-production"
_MIN_SECRET_LEN = 32


class Settings(BaseSettings):
    # OpenAI
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

    # Tavily
    tavily_api_key: str = ""

    # GitHub
    github_token: str = ""

    # Calendly
    calendly_token: str = ""

    # Database
    database_url: str = "sqlite+aiosqlite:///./resumate.db"

    # ChromaDB
    chroma_dir: str = "chroma_db"
    chroma_collection: str = "resumes"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False

    # CORS — comma-separated origin list. The defaults cover local dev (3000, 3001,
    # 5173) and the Render frontend URL so the app boots usable even if the
    # CORS_ORIGINS env var isn't set. Override in production for security.
    cors_origins: str = (
        "http://localhost:3000,http://localhost:3001,http://localhost:5173,"
        "https://resumate-ui.onrender.com"
    )

    # JWT Auth
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30

    # Email (SendGrid)
    sendgrid_api_key: str = ""
    from_email: str = "noreply@resumate.ai"

    # Shared secret the interview worker uses to authenticate machine-to-machine
    # calls like /save-transcript. Set in both backend and worker env vars.
    agent_shared_secret: str = ""
    
    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


def _validate_secret_key(s: "Settings") -> None:
    """Ensure SECRET_KEY isn't the public default or trivially short in production.

    In debug mode we only warn — local dev shouldn't be blocked. In production we
    refuse to boot, because a known/short key means anyone can forge JWTs.
    """
    weak = (not s.secret_key) or s.secret_key == _DEFAULT_SECRET or len(s.secret_key) < _MIN_SECRET_LEN
    if not weak:
        return
    msg = (
        f"SECRET_KEY is missing, the public default, or shorter than {_MIN_SECRET_LEN} chars. "
        "Set a strong SECRET_KEY env var (e.g. `python -c \"import secrets; print(secrets.token_urlsafe(64))\"`)."
    )
    if s.debug:
        warnings.warn(msg, RuntimeWarning, stacklevel=2)
    else:
        raise RuntimeError(msg)


settings = Settings()
_validate_secret_key(settings)
