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

def engine_options(url: str) -> dict:
    """How the engine is made for this database.

    hide_parameters: a database error's text held the statement's values, a
    candidate's name, address and résumé among them, and the error went to
    the log. On Postgres, a connection the server or a proxy closed while it
    sat idle in the pool failed the next request that drew it: each is now
    checked before use, and replaced after 30 minutes.
    """
    options = {"echo": False, "hide_parameters": True}
    if not url.startswith("sqlite"):
        options.update(pool_pre_ping=True, pool_recycle=1800)
    return options


engine = create_async_engine(DATABASE_URL, **engine_options(DATABASE_URL))
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


def migration_head() -> str:
    """The newest migration's revision id, read from alembic/versions."""
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    backend = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return ScriptDirectory.from_config(Config(os.path.join(backend, "alembic.ini"))).get_current_head()


def add_missing_columns(conn) -> list:
    """Add to a SQLite file the columns its models have and it lacks.

    create_all makes missing tables, not missing columns, so a local file made
    before a new column (hiring_managers.hide_names) broke every query on that
    table, signing in included. Only the column is added, not an index or a
    unique rule on it. One SQLite can't add, such as NOT NULL with no default
    on a table with rows, is left, with a warning. Returns what was added, as
    table.column.
    """
    from sqlalchemy import inspect
    from sqlalchemy.schema import CreateColumn
    found = inspect(conn)
    added = []
    for table in Base.metadata.sorted_tables:
        if not found.has_table(table.name):
            continue
        have = {c["name"] for c in found.get_columns(table.name)}
        for column in table.columns:
            if column.name in have:
                continue
            ddl = CreateColumn(column).compile(dialect=conn.dialect)
            try:
                conn.exec_driver_sql(f'ALTER TABLE "{table.name}" ADD COLUMN {ddl}')
                added.append(f"{table.name}.{column.name}")
            except Exception as exc:
                print(f"[WARN] {table.name}.{column.name} could not be added: {type(exc).__name__}")
    return added


def production_refusal(dialect: str, has_history: bool = True):
    """Why production (DEBUG off) can't start on this database, or None.

    A SQLite file there is wiped by every deploy, and with DATABASE_URL
    unset production quietly ran on one. A Postgres with no migration
    history was built by create_all, which hides what a migration left out.
    Local runs (DEBUG on) start on either, as before.
    """
    if settings.debug:
        return None
    if dialect == "sqlite":
        return ("Production needs Postgres: the database is a SQLite file, which every deploy "
                "wipes. Set DATABASE_URL to the Postgres database (DEBUG=true runs locally).")
    if not has_history:
        return ("The database has no migration history. Run `alembic upgrade head` on an empty "
                "database, or `alembic stamp head` once on one the app built, then start again.")
    return None


async def init_db():
    """Get the database ready.

    SQLite (local runs and tests) is built straight from the models, new
    columns included (add_missing_columns). Postgres
    is built by the migrations: render.yaml runs `alembic upgrade head` before
    every start. create_all there hid a migration that left something out,
    because it quietly made whatever was missing, so on Postgres this checks
    that the database answers and is migrated to the newest revision, and
    raises otherwise.

    A Postgres database with no migration history at all was built by
    create_all; locally it keeps being built that way, with a warning.
    Production refuses both it and SQLite (production_refusal).
    """
    from sqlalchemy import inspect, text
    refusal = production_refusal(engine.dialect.name)
    if refusal:
        raise RuntimeError(refusal)
    async with engine.begin() as conn:
        if engine.dialect.name == "sqlite":
            await conn.run_sync(Base.metadata.create_all)
            added = await conn.run_sync(add_missing_columns)
            print("Database tables created" + (f"; columns added: {', '.join(added)}" if added else ""))
            return
        await conn.execute(text("SELECT 1"))
        if not await conn.run_sync(lambda c: inspect(c).has_table("alembic_version")):
            refusal = production_refusal(engine.dialect.name, has_history=False)
            if refusal:
                raise RuntimeError(refusal)
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
