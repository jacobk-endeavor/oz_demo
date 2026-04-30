from sqlalchemy import Column, DateTime, Enum, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.enums import DealStatus


class Deal(Base):
    __tablename__ = "deals"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    status = Column(Enum(DealStatus), nullable=False, default=DealStatus.NEW_LEAD)
    estimated_arr = Column(Float, nullable=True)
    point_of_contact_id = Column(Integer, ForeignKey("people.id"), nullable=True)
    objections = Column(Text, nullable=True)
    risks = Column(Text, nullable=True)
    key_factors = Column(Text, nullable=True)
    lean_into = Column(Text, nullable=True)
    hubspot_deal_id = Column(String, unique=True, nullable=True)
    hubspot_deal_stage = Column(String, nullable=True)
    sales_rep_id = Column(Integer, ForeignKey("sales_reps.id"), nullable=True)
    close_date = Column(DateTime(timezone=True), nullable=True)
    amount = Column(Float, nullable=True)

    company = relationship("Company", backref="deals")
    point_of_contact = relationship("Person", foreign_keys=[point_of_contact_id], backref="point_of_contact_deals")
    sales_rep = relationship("SalesRep", back_populates="deals")
    participants = relationship("DealParticipant", back_populates="deal", cascade="all, delete-orphan")


class DealParticipant(Base):
    __tablename__ = "deal_participants"
    __table_args__ = (UniqueConstraint("deal_id", "person_id", name="uq_deal_participants_deal_person"),)

    id = Column(Integer, primary_key=True, index=True)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=False)
    person_id = Column(Integer, ForeignKey("people.id"), nullable=False)
    position = Column(String, nullable=True)

    deal = relationship("Deal", back_populates="participants")
    person = relationship("Person", backref="deal_participations")
