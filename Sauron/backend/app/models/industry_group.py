from sqlalchemy import Column, Enum, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.associations import company_industry_group
from app.models.enums import Vertical


class IndustryGroup(Base):
    __tablename__ = "industry_groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    vertical = Column(Enum(Vertical), nullable=True)

    companies = relationship(
        "Company", secondary=company_industry_group, back_populates="industry_groups"
    )
