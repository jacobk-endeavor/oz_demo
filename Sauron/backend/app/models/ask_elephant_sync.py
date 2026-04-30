from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.sql import func

from app.database import Base


class AskElephantSyncState(Base):
    __tablename__ = "ask_elephant_sync_state"

    id = Column(Integer, primary_key=True, index=True)
    source = Column(String, unique=True, nullable=False, index=True)
    last_successful_start_at = Column(DateTime(timezone=True), nullable=True)
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    last_error = Column(Text, nullable=True)


class AskElephantSyncFailure(Base):
    __tablename__ = "ask_elephant_sync_failures"

    id = Column(Integer, primary_key=True, index=True)
    engagement_id = Column(String, unique=True, nullable=False, index=True)
    error = Column(Text, nullable=False)
    attempts = Column(Integer, nullable=False, default=1)
    first_seen_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    last_seen_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
