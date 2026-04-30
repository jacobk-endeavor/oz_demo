from sqlalchemy import BigInteger, Boolean, Column, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.associations import (
    company_email_company,
    company_industry_group,
    meeting_company,
)
from app.models.enums import ERP, Competitor, Vertical


class Company(Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    summary = Column(Text, nullable=True)
    vertical = Column(Enum(Vertical), nullable=True)
    revenue = Column(String, nullable=True)
    annual_revenue = Column(BigInteger, nullable=True)
    employee_count = Column(Integer, nullable=True)
    location_count = Column(Integer, nullable=True)
    linkedin = Column(String, nullable=True)
    erp = Column(Enum(ERP), nullable=True)
    competitor = Column(Enum(Competitor), nullable=True)
    key_facts = Column(JSONB, nullable=True)
    is_named_account = Column(Boolean, default=False)
    parent_company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)

    parent_company = relationship("Company", remote_side="Company.id", backref="subsidiaries")
    industry_groups = relationship(
        "IndustryGroup", secondary=company_industry_group, back_populates="companies"
    )
    meetings = relationship("Meeting", secondary=meeting_company, back_populates="companies")
    company_emails = relationship(
        "CompanyEmail",
        secondary=company_email_company,
        back_populates="companies",
    )
