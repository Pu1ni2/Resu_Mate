"""Database connection and session management"""
import os
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings


class Base(DeclarativeBase):
    pass


# Build database URL
DATABASE_URL = os.environ.get("DATABASE_URL", settings.database_url)

# Handle Render's postgres:// vs postgresql://
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
elif DATABASE_URL and DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
elif not DATABASE_URL or DATABASE_URL == "":
    # Fallback to SQLite for local dev
    DATABASE_URL = "sqlite+aiosqlite:///./resumate.db"

def display_url(url: str) -> str:
    """The database URL with its password masked, for logs.

    The boot line printed everything before the "@", which for Postgres is
    user:password, into the logs on every boot.
    """
    return make_url(url).render_as_string(hide_password=True)


print(f"Database: {display_url(DATABASE_URL)}")

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


def migration_head() -> str:
    """The newest migration's revision id, read from alembic/versions."""
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    backend = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return ScriptDirectory.from_config(Config(os.path.join(backend, "alembic.ini"))).get_current_head()


async def init_db():
    """Get the database ready.

    SQLite (local runs and tests) is built straight from the models. Postgres
    is built by the migrations: render.yaml runs `alembic upgrade head` before
    every start. create_all there hid a migration that left something out,
    because it quietly made whatever was missing, so on Postgres this checks
    that the database answers and is migrated to the newest revision, and
    raises otherwise.

    A Postgres database with no migration history at all was built by
    create_all; it keeps being built that way, with a warning.
    """
    from sqlalchemy import inspect, text
    async with engine.begin() as conn:
        if engine.dialect.name == "sqlite":
            await conn.run_sync(Base.metadata.create_all)
            print("Database tables created")
            return
        await conn.execute(text("SELECT 1"))
        if not await conn.run_sync(lambda c: inspect(c).has_table("alembic_version")):
            print("[WARN] The database has no migration history, so it is built from the models. "
                  "Run `alembic stamp head` once, then `alembic upgrade head` on every deploy.")
            await conn.run_sync(Base.metadata.create_all)
            return
        current = set((await conn.execute(text("SELECT version_num FROM alembic_version"))).scalars())
    head = migration_head()
    if head not in current:
        raise RuntimeError(
            f"The database is at migration {', '.join(sorted(current)) or 'none'}, but the code needs "
            f"{head}. Run `alembic upgrade head`."
        )
    print(f"Database migrated to {head}")


async def get_db():
    """Get database session"""
    async with async_session() as session:
        yield session
