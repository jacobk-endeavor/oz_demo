from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.associations import pe_group_company


class PEGroup(Base):
    __tablename__ = "pe_groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    aum = Column(String, nullable=True)

    companies = relationship("Company", secondary=pe_group_company, backref="pe_groups")
