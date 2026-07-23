from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

SQLITE_PATH = "songs.db"
DATABASE_URL = f"sqlite:///{SQLITE_PATH}"

engine = create_engine(DATABASE_URL, echo=False)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
