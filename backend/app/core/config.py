"""Configuration settings for the application"""
import os
import warnings
from pydantic import field_validator
from pydantic_settings import BaseSettings
from typing import List, Optional

_DEFAULT_SECRET = "change-me-in-production"
_MIN_SECRET_LEN = 32

# The dev servers' origins, which CORS lets in only on local runs (DEBUG).
# Production let them in too: any page running on a visitor's own machine
# could call the API in their name.
LOCAL_ORIGINS = (
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3006",
    "http://localhost:5173",
)


def origin_of(url: str) -> str:
    """The scheme and host a browser sends as Origin: no path, no trailing slash."""
    from urllib.parse import urlsplit
    parts = urlsplit(url.strip())
    return f"{parts.scheme}://{parts.netloc}" if parts.scheme and parts.netloc else ""

# The settings file, read from the working directory. RESUMATE_ENV_FILE names
# another: the tests give an empty one, so the real keys in a developer's
# backend/.env (OpenAI, SendGrid, S3) never reach a test run.
ENV_FILE = os.environ.get("RESUMATE_ENV_FILE", ".env")


class Settings(BaseSettings):
    # OpenAI
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"
    # The other models, set here (or in the environment) like OPENAI_MODEL:
    # they were written into seven files. The interview worker reads the
    # same names from its environment (interview_agent.py), and the realtime
    # model is below with the voice interview's settings.
    embedding_model: str = "text-embedding-3-small"
    # The emails a manager may send to candidates in a day
    # (app/services/email_quota.py).
    daily_email_limit: int = 100
    transcription_model: str = "gpt-4o-transcribe"
    speech_to_text_model: str = "whisper-1"
    text_to_speech_model: str = "tts-1"

    # Tavily
    tavily_api_key: str = ""

    # GitHub
    github_token: str = ""

    # Candidate sourcer. Judging a whole pool is many small calls, so it can run
    # on a cheaper model than OPENAI_MODEL (blank = OPENAI_MODEL). Prices are per
    # million tokens and optional: without them the page shows tokens rather than
    # a guessed dollar figure. The caps bound one run's API quota and spend.
    sourcer_model: str = ""
    sourcer_price_in_per_1m: Optional[float] = None
    sourcer_price_out_per_1m: Optional[float] = None
    sourcer_max_github: int = 300
    sourcer_max_web: int = 30

    @field_validator("sourcer_price_in_per_1m", "sourcer_price_out_per_1m", mode="before")
    @classmethod
    def _blank_price_is_unset(cls, value):
        # "SOURCER_PRICE_IN_PER_1M=" arrives as "", which is not a number and
        # would stop the app booting. Blank means no price, as leaving it out does.
        return None if isinstance(value, str) and not value.strip() else value

    @property
    def sourcer_llm_model(self) -> str:
        return self.sourcer_model or self.openai_model

    # Calendly
    calendly_token: str = ""

    # Database
    database_url: str = "sqlite+aiosqlite:///./resumate.db"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False

    # CORS: comma-separated origins allowed besides FRONTEND_URL's, e.g. a
    # second domain. See cors_origins_list.
    cors_origins: str = ""

    # Public base URL of the frontend: the links inside outbound emails, and
    # the origin CORS lets in. It must be reachable by the recipient: an
    # interview invitation is read on the candidate's machine, so a localhost
    # URL is a dead link for everyone but its developer. Production needs it
    # set (require_frontend_url): its default was one deployment's address,
    # so any other sent its candidates there.
    frontend_url: str = ""

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
    # How long one email may take. SendGrid's client waited for ever, holding
    # up whatever was sending it.
    sendgrid_timeout_seconds: float = 10

    # Shared secret the interview worker uses to authenticate machine-to-machine
    # calls like /save-transcript. Set in both backend and worker env vars.
    agent_shared_secret: str = ""

    # Avatar interviews need the LiveKit interview worker (interview_agent.py)
    # running somewhere. Turn this on only once it is; until then every
    # interview runs voice-only. See app/services/interview_modes.py.
    avatar_interviews: bool = False

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
        """Origins allowed by CORS: FRONTEND_URL's, CORS_ORIGINS, and on local
        runs (DEBUG) the dev servers'.

        FRONTEND_URL's is always among them, so a blank or stale CORS_ORIGINS
        can't lock the site out: the "No Access-Control-Allow-Origin header"
        lockout that a fixed, always-merged list used to prevent. Entries are
        reduced to the origin a browser sends, blanks dropped, duplicates
        removed in order.
        """
        listed = [self.frontend_url, *(self.cors_origins or "").split(",")]
        if self.debug:
            listed += LOCAL_ORIGINS
        merged: List[str] = []
        for origin in map(origin_of, listed):
            if origin and origin not in merged:
                merged.append(origin)
        return merged

    def require_frontend_url(self) -> None:
        """Production doesn't start without FRONTEND_URL.

        Its emails link to the site, and CORS lets the site in, by it. The
        server checks when it starts (main.py), as for email, so migrations
        and CI's checks run without it. Local runs (DEBUG) work without it:
        their links are relative to the site that shows them.
        """
        if self.debug or origin_of(self.frontend_url):
            return
        raise RuntimeError(
            "FRONTEND_URL isn't set, and production needs it: emailed links point to it, "
            "and it's the site allowed to call the API. Set it to the frontend's public "
            "address, e.g. https://app.example.com."
        )

    class Config:
        env_file = ENV_FILE
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
