from sqlalchemy import CheckConstraint, Column, Enum, Integer, String, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.enums import Role


class Position(Base):
    __tablename__ = "positions"
    __table_args__ = (
        CheckConstraint(
            "(CASE WHEN company_id IS NOT NULL THEN 1 ELSE 0 END"
            " + CASE WHEN pe_group_id IS NOT NULL THEN 1 ELSE 0 END"
            " + CASE WHEN industry_group_id IS NOT NULL THEN 1 ELSE 0 END) = 1",
            name="position_single_entity",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    role = Column(Enum(Role), nullable=True)
    person_id = Column(Integer, ForeignKey("people.id"), nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    pe_group_id = Column(Integer, ForeignKey("pe_groups.id"), nullable=True)
    industry_group_id = Column(Integer, ForeignKey("industry_groups.id"), nullable=True)

    person = relationship("Person", backref="positions")
    company = relationship("Company", backref="positions")
    pe_group = relationship("PEGroup", backref="positions")
    industry_group = relationship("IndustryGroup", backref="positions")
