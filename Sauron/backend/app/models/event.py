from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base


class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    date = Column(String, nullable=True)
    address = Column(String, nullable=True)
    industry_group_id = Column(Integer, ForeignKey("industry_groups.id"), nullable=True)

    industry_group = relationship("IndustryGroup", backref="events")
