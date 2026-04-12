"""Alembic environment — async SQLAlchemy (asyncpg / aiosqlite)"""
import os
import sys
import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import context

# ── make sure 'backend/' is on sys.path so app imports work ──────────────────
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load .env so DATABASE_URL is available when running alembic directly
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

# ── import Base + every model so Alembic can see them ───────────────────────
from app.core.database import Base  # noqa: F401
from app.models.candidate import Candidate, Interview, Evaluation, CandidateAccess  # noqa: F401
from app.models.auth import HiringManager, OTPCode  # noqa: F401
from app.models.state import ChatHistory, AdvisorSession  # noqa: F401

# ── resolve DATABASE_URL ──────────────────────────────────────────────────────
def get_database_url() -> str:
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        # Local dev fallback
        url = "sqlite+aiosqlite:///./resumate.db"
        print("[alembic] WARNING: DATABASE_URL not set, using local SQLite")
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgresql://") and "+asyncpg" not in url:
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


# ── Alembic config ────────────────────────────────────────────────────────────
config = context.config
config.set_main_option("sqlalchemy.url", get_database_url())

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


# ── offline mode (generate SQL without connecting) ───────────────────────────
def run_migrations_offline() -> None:
    url = get_database_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


# ── online mode (connect and run) ─────────────────────────────────────────────
def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    url = get_database_url()
    connectable = create_async_engine(url, poolclass=pool.NullPool)
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
