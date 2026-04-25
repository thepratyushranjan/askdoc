from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.ext.asyncio import AsyncAttrs

class Base(AsyncAttrs, DeclarativeBase):
    """
    Base class for all SQLAlchemy declarative models.
    Inherits from AsyncAttrs to handle async lazy loading of relationships if needed.
    """
    pass

