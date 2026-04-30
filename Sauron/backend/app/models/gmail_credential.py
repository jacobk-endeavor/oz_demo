from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.sql import func

from app.database import Base


class GmailCredential(Base):
    __tablename__ = "gmail_credentials"

    id = Column(Integer, primary_key=True, index=True)
    connection_key = Column(String, nullable=False, unique=True)
    account_email = Column(String, nullable=True)
    access_token = Column(Text, nullable=False)
    refresh_token = Column(Text, nullable=False)
    scopes = Column(Text, nullable=True)
    token_expiry = Column(DateTime(timezone=True), nullable=True)
    last_history_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
