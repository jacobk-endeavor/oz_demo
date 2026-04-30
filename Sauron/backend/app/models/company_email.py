from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.associations import company_email_company, company_email_user
from app.models.enums import EmailDirection


class CompanyEmail(Base):
    __tablename__ = "company_emails"

    id = Column(Integer, primary_key=True, index=True)
    hubspot_email_id = Column(String, unique=True, nullable=False)
    hubspot_owner_id = Column(String, nullable=True, index=True)
    owner_sales_rep_id = Column(
        Integer,
        ForeignKey("sales_reps.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    owner_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    direction = Column(
        Enum(EmailDirection, name="emaildirection", values_callable=lambda e: [i.value for i in e]),
        nullable=False,
    )
    hubspot_direction = Column(String, nullable=True)
    hubspot_status = Column(String, nullable=True)
    hubspot_thread_id = Column(String, nullable=True, index=True)
    hubspot_message_id = Column(String, nullable=True, index=True)
    hubspot_thread_summary = Column(Text, nullable=True)
    hubspot_member_of_forwarded_subthread = Column(Boolean, nullable=True)
    subject = Column(String, nullable=False, server_default="")
    body_preview = Column(Text, nullable=True)
    from_email = Column(String, nullable=True)
    to_emails = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    cc_emails = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    bcc_emails = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    participant_emails = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    occurred_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    hubspot_created_at = Column(DateTime(timezone=True), nullable=True)
    hubspot_updated_at = Column(DateTime(timezone=True), nullable=True, index=True)
    hubspot_url = Column(String, nullable=True)
    raw_payload = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    companies = relationship(
        "Company",
        secondary=company_email_company,
        back_populates="company_emails",
    )
    users = relationship(
        "User",
        secondary=company_email_user,
        back_populates="company_emails",
    )
    owner_sales_rep = relationship("SalesRep", lazy="selectin")
    owner_user = relationship("User", foreign_keys=[owner_user_id], lazy="selectin")


class CompanyEmailSyncState(Base):
    __tablename__ = "company_email_sync_state"

    provider = Column(String, primary_key=True)
    last_modified_at = Column(DateTime(timezone=True), nullable=True)
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    last_successful_run_at = Column(DateTime(timezone=True), nullable=True)
    last_error = Column(Text, nullable=True)
