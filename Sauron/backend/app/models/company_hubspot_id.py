from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class CompanyHubspotId(Base):
    __tablename__ = "company_hubspot_ids"

    id = Column(Integer, primary_key=True, index=True)
    hubspot_company_id = Column(String, nullable=False, unique=True)
    company_id = Column(
        Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )

    company = relationship("Company", backref="hubspot_ids")
