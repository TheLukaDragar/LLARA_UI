import os
from pathlib import Path
from sqlalchemy import create_engine, Column, Integer, String, Boolean, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession

# Create data directory relative to the current file
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

DB_PATH = DATA_DIR / "summaries.db"
SQLALCHEMY_DATABASE_URL = f"sqlite+aiosqlite:///{DB_PATH}"

engine = create_async_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

Base = declarative_base()

class SummaryModel(Base):
    __tablename__ = "summaries"

    id = Column(Integer, primary_key=True, index=True)
    input = Column(Text)
    output = Column(Text)
    num_words = Column(Integer)
    is_bullet = Column(Boolean)
    summary_category = Column(String, nullable=True)
    num_bullet_points = Column(Integer, nullable=True)
    instruction = Column(String, nullable=True)
    token_length = Column(Integer, nullable=True)

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session