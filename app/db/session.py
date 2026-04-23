import logging
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.core.config import settings

logger = logging.getLogger(__name__)

# Create the async engine
# Note: pool_pre_ping=True helps handle dropped connections automatically
engine = create_async_engine(
    settings.SQLALCHEMY_DATABASE_URI,
    echo=False,  # Set to True for debugging SQL queries
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20
)

# Create a configured "Session" class
AsyncSessionLocal = async_sessionmaker(
    bind=engine, 
    class_=AsyncSession, 
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

async def get_db() -> AsyncSession:
    """
    Dependency function that yields database sessions.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
