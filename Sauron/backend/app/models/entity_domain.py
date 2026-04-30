from sqlalchemy import CheckConstraint, Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class EntityDomain(Base):
    __tablename__ = "entity_domains"
    __table_args__ = (
        CheckConstraint(
            "(CASE WHEN company_id IS NOT NULL THEN 1 ELSE 0 END"
            " + CASE WHEN pe_group_id IS NOT NULL THEN 1 ELSE 0 END"
            " + CASE WHEN industry_group_id IS NOT NULL THEN 1 ELSE 0 END) = 1",
            name="entity_domain_single_entity",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    domain = Column(String, nullable=False, unique=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=True)
    pe_group_id = Column(Integer, ForeignKey("pe_groups.id", ondelete="CASCADE"), nullable=True)
    industry_group_id = Column(Integer, ForeignKey("industry_groups.id", ondelete="CASCADE"), nullable=True)

    company = relationship("Company", backref="entity_domains")
    pe_group = relationship("PEGroup", backref="entity_domains")
    industry_group = relationship("IndustryGroup", backref="entity_domains")
