from sqlalchemy import Column, DateTime, ForeignKey, Integer, UniqueConstraint, func
from sqlalchemy.orm import relationship

from app.database import Base


class EmailReadStatus(Base):
    __tablename__ = "email_read_status"
    __table_args__ = (
        UniqueConstraint("lead_email_id", "user_id", name="uq_email_read_status_email_user"),
    )

    id = Column(Integer, primary_key=True, index=True)
    lead_email_id = Column(Integer, ForeignKey("lead_emails.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    read_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    lead_email = relationship("LeadEmail")
    user = relationship("User")
