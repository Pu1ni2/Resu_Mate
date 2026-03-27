"""Database connection and session management"""
import os
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

print(f"Database: {DATABASE_URL.split('@')[0] if '@' in DATABASE_URL else DATABASE_URL}")

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db():
    """Create all tables"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Database tables created")


async def get_db():
    """Get database session"""
    async with async_session() as session:
        yield session
