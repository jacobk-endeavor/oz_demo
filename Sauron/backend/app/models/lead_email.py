from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.enums import EmailDirection


class LeadEmail(Base):
    __tablename__ = "lead_emails"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True)
    contact_id = Column(Integer, ForeignKey("lead_contacts.id", ondelete="SET NULL"), nullable=True)
    lead_action_id = Column(Integer, ForeignKey("lead_actions.id", ondelete="SET NULL"), nullable=True)
    sent_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    gmail_message_id = Column(String, unique=True, nullable=False)
    gmail_thread_id = Column(String, nullable=True, index=True)
    direction = Column(
        Enum(EmailDirection, name="emaildirection", values_callable=lambda e: [i.value for i in e]),
        nullable=False,
    )
    from_email = Column(String, nullable=False)
    to_email = Column(String, nullable=False)
    subject = Column(String, nullable=False, server_default="")
    body_plain = Column(Text, nullable=True)
    occurred_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    lead = relationship("Lead")
    contact = relationship("LeadContact", lazy="selectin")
    action = relationship("LeadAction", lazy="selectin")
    sent_by_user = relationship("User", lazy="selectin")
