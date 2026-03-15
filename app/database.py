import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# This URL matches the credentials in your docker-compose.yml
# "db" is the hostname of the postgres container
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://stov_admin:securepassword123@db:5432/stov_database")

engine = create_engine(SQLALCHEMY_DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Dependency to get the DB session for our routes
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
