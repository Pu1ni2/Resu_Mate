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
        "http://localhost:3000,http://localhost:3001,http://localhost:3006,"
        "http://localhost:5173,"
        "https://resumate-ui.onrender.com"
    )

    # Public base URL of the frontend, used to build links inside outbound
    # emails. This MUST be reachable by the recipient — an interview invitation
    # is read on the candidate's machine, so a localhost URL is a dead link for
    # everyone except the developer who wrote it. Defaults to the deployed
    # frontend rather than a dev port so a missing env var degrades to "works
    # in production" instead of "works only on my laptop".
    frontend_url: str = "https://resumate-ui.onrender.com"

    @property
    def candidate_login_url(self) -> str:
        return f"{self.frontend_url.rstrip('/')}/candidate/login"

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

    # OpenAI Realtime API — used by the conversational interview mode (audio-only,
    # no LiveKit). Both the model name and the voice are allow-listed in
    # app/api/realtime.py so a typo here surfaces as a clean 400, not an opaque
    # WebRTC failure.
    realtime_model: str = "gpt-realtime-2"
    realtime_voice: str = "marin"
    realtime_max_total_minutes: int = 8

    # Object storage for original resume files (S3-compatible: AWS S3,
    # Cloudflare R2, Backblaze B2). All optional — if s3_bucket is unset the
    # app keeps today's "parse then delete" behaviour and stores no originals.
    s3_bucket: str = ""
    s3_endpoint: str = ""        # e.g. https://<account>.r2.cloudflarestorage.com (blank = AWS default)
    s3_region: str = "us-east-1"
    s3_access_key: str = ""
    s3_secret_key: str = ""
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Origins allowed by CORS.

        The env-provided CORS_ORIGINS is MERGED with a set of always-allowed
        origins (the Render frontend + local dev ports) rather than replacing
        them. This way a malformed, empty, or stale CORS_ORIGINS value set in
        the Render dashboard can't lock the production frontend out — the cause
        of the "No Access-Control-Allow-Origin header" lockout. Blank entries
        are dropped and duplicates de-duped while preserving order.
        """
        always_allowed = [
            "http://localhost:3000",
            "http://localhost:3001",
            "http://localhost:3006",
            "http://localhost:5173",
            "https://resumate-ui.onrender.com",
        ]
        from_env = [o.strip() for o in (self.cors_origins or "").split(",")]
        seen: set = set()
        merged: List[str] = []
        for origin in [*from_env, *always_allowed]:
            if origin and origin not in seen:
                seen.add(origin)
                merged.append(origin)
        return merged
    
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
