from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.enums import (
    ERP,
    ActionCategory,
    LeadCompanyType,
    LeadIndustry,
    LeadTier,
)


class Lead(Base):
    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, index=True)
    company = Column(String, nullable=False)
    domain = Column(String, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    user = relationship("User", lazy="selectin")
    profile = relationship(
        "LeadCompanyProfile", back_populates="lead", uselist=False, lazy="selectin"
    )
    contacts = relationship(
        "LeadContact",
        back_populates="lead",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    strategic_context = relationship(
        "LeadStrategicContext",
        back_populates="lead",
        uselist=False,
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    actions = relationship(
        "LeadAction",
        back_populates="lead",
        lazy="noload",
        cascade="all, delete-orphan",
        order_by="LeadAction.occurred_at.desc()",
    )


class LeadCompanyProfile(Base):
    __tablename__ = "lead_company_profiles"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(
        Integer, ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    erp = Column(Enum(ERP, name="erp", create_type=False), nullable=True)
    num_erp_users = Column(Integer, nullable=True)
    num_locations = Column(Integer, nullable=True)
    buying_groups = Column(JSONB, nullable=True)
    associations = Column(String, nullable=True)
    primary_industry = Column(
        Enum(
            LeadIndustry,
            name="leadindustry",
            create_type=False,
            values_callable=lambda enum_cls: [item.value for item in enum_cls],
        ),
        nullable=True,
    )
    company_type = Column(
        Enum(
            LeadCompanyType,
            name="leadcompanytype",
            create_type=False,
            values_callable=lambda enum_cls: [item.value for item in enum_cls],
        ),
        nullable=True,
    )
    revenue_m = Column(String, nullable=True)
    type = Column(Enum(LeadTier, name="leadtier", create_type=False), nullable=True)
    company_summary = Column(JSONB, nullable=True)
    hq_address = Column(String, nullable=True)
    hq_phone = Column(String, nullable=True)
    employee_count = Column(Integer, nullable=True)
    hq_timezone = Column(String, nullable=True)

    lead = relationship("Lead", back_populates="profile")


class LeadStrategicContext(Base):
    __tablename__ = "lead_strategic_contexts"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(
        Integer, ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    recent_initiatives = Column(String, nullable=True)
    recent_initiatives_sources = Column(JSONB, nullable=True)
    public_priorities = Column(String, nullable=True)
    public_priorities_sources = Column(JSONB, nullable=True)
    operational_changes = Column(String, nullable=True)
    operational_changes_sources = Column(JSONB, nullable=True)
    workflow_modernization_signals = Column(String, nullable=True)
    workflow_modernization_signals_sources = Column(JSONB, nullable=True)
    trigger_events = Column(JSONB, nullable=True)
    company_background = Column(String, nullable=True)

    lead = relationship("Lead", back_populates="strategic_context")


class LeadContact(Base):
    __tablename__ = "lead_contacts"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(
        Integer, ForeignKey("leads.id", ondelete="CASCADE"), nullable=False
    )
    apollo_person_id = Column(String, nullable=True, index=True)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    title = Column(String, nullable=True)
    linkedin_url = Column(String, nullable=True)
    facebook_url = Column(String, nullable=True)
    instagram_url = Column(String, nullable=True)
    photo_url = Column(String, nullable=True)
    likely_kpis = Column(JSONB, nullable=True)
    summary = Column(JSONB, nullable=True)
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    lead = relationship("Lead", back_populates="contacts")
    phone_numbers = relationship(
        "LeadContactPhone",
        back_populates="contact",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    experiences = relationship(
        "ContactExperience",
        back_populates="contact",
        lazy="selectin",
        cascade="all, delete-orphan",
    )


class LeadContactPhone(Base):
    __tablename__ = "lead_contact_phones"

    id = Column(Integer, primary_key=True, index=True)
    contact_id = Column(
        Integer, ForeignKey("lead_contacts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    number = Column(String, nullable=False)
    type = Column(String, nullable=False, server_default="unknown")
    status = Column(String, nullable=True)
    confidence = Column(String, nullable=True)
    is_primary = Column(Boolean, nullable=False, default=False, server_default="false")
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    contact = relationship("LeadContact", back_populates="phone_numbers")


class ContactExperience(Base):
    __tablename__ = "contact_experiences"

    id = Column(Integer, primary_key=True, index=True)
    contact_id = Column(
        Integer, ForeignKey("lead_contacts.id", ondelete="CASCADE"), nullable=False
    )
    company = Column(String, nullable=False)
    title = Column(String, nullable=True)
    start_date = Column(String, nullable=True)
    end_date = Column(String, nullable=True)

    contact = relationship("LeadContact", back_populates="experiences")


class LeadAction(Base):
    __tablename__ = "lead_actions"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(
        Integer, ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    contact_id = Column(
        Integer, ForeignKey("lead_contacts.id", ondelete="SET NULL"), nullable=True
    )
    category = Column(
        Enum(
            ActionCategory,
            name="actioncategory",
            values_callable=lambda e: [i.value for i in e],
        ),
        nullable=False,
    )
    title = Column(String, nullable=False)
    notes = Column(Text, nullable=True)
    call_duration_seconds = Column(Integer, nullable=True)
    call_transcript = Column(Text, nullable=True)
    dialed_phone_number = Column(String, nullable=True)
    dialed_phone_type = Column(String, nullable=True)
    occurred_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    lead = relationship("Lead", back_populates="actions")
    user = relationship("User", lazy="selectin")
    contact = relationship("LeadContact", lazy="selectin")


class ApolloPhoneCache(Base):
    """Buffer for async phone webhook results that arrive before contacts are persisted."""

    __tablename__ = "apollo_phone_cache"

    id = Column(Integer, primary_key=True, index=True)
    apollo_person_id = Column(String, nullable=False, index=True)
    phone_numbers = Column(JSONB, nullable=False)
    received_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
