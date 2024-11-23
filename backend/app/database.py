import os
from pathlib import Path

from sqlalchemy import Boolean, Column, Integer, String, Text, create_engine, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

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
    summary_category = Column(String)
    num_bullet_points = Column(Integer, nullable=True)
    instruction = Column(Text, nullable=True)
    instruction_prefix = Column(Text, nullable=True)
    token_length = Column(Integer, nullable=True)


async def check_and_add_column(conn, table_name, column_name, column_type):
    # Check if column exists
    try:
        await conn.execute(text(f"SELECT {column_name} FROM {table_name} LIMIT 1"))
    except Exception:
        # Column doesn't exist, add it
        await conn.execute(
            text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}")
        )


async def init_db():
    async with engine.begin() as conn:
        # Create tables if they don't exist
        await conn.run_sync(Base.metadata.create_all)

        # Check and add instruction_prefix column if it doesn't exist
        await check_and_add_column(conn, "summaries", "instruction_prefix", "TEXT")

        # Update existing records to populate instruction_prefix based on is_bullet and summary_category
        update_sql = text(
            """
            UPDATE summaries 
            SET instruction_prefix = 
                CASE 
                    WHEN is_bullet = 1 THEN
                        CASE summary_category 
                            WHEN 'ultra_concise' THEN 'Naredi ' || COALESCE(num_bullet_points, '3') || ' kraih alinej iz besedila. Naj bodo izjemno kratke in jedrnate.'
                            WHEN 'concise' THEN 'Pretvori besedilo v ' || COALESCE(num_bullet_points, '3') || ' alinej. Naj bodo kratke in jasne.'
                            WHEN 'short' THEN 'Ustvari ' || COALESCE(num_bullet_points, '3') || ' alinej iz besedila, z nekoliko več podrobnosti.'
                            WHEN 'medium' THEN 'Naredi ' || COALESCE(num_bullet_points, '3') || ' alinej iz besedila z zmerno količino podrobnosti.'
                            WHEN 'long' THEN 'Razčleni besedilo v ' || COALESCE(num_bullet_points, '3') || ' alinej z več podrobnostmi in razširjenimi pojasnili.'
                            ELSE 'Razvij ' || COALESCE(num_bullet_points, '3') || ' alinej iz besedila, pri čemer vključuješ poglobljene informacije in podrobne razlage.'
                        END
                    ELSE
                        CASE summary_category 
                            WHEN 'ultra_concise' THEN 'Zgoščeno povzemite glavno idejo v eni sami, osrednji misli. Povzetek naj bo čim krajši.'
                            WHEN 'concise' THEN 'Strnite bistvo v kratke in jedrnate povedi, izpostavljajoč najpomembnejše informacije.'
                            WHEN 'short' THEN 'Napišite kratek povzetek, ki zajame ključne točke in poudari pomembne informacije.'
                            WHEN 'medium' THEN 'Oblikujte povzetek, ki vključuje pomembne podrobnosti in argumente.'
                            WHEN 'long' THEN 'Pripravite obširen povzetek, ki pokriva vse ključne vidike in informacije.'
                            ELSE 'Ustvarite temeljit povzetek, ki podrobno povzema vse glavne točke, podatke in zaključke.'
                        END
                END
            WHERE instruction_prefix IS NULL
        """
        )
        await conn.execute(update_sql)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
