from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.associations import meeting_sales_rep


class SalesRep(Base):
    __tablename__ = "sales_reps"

    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    email = Column(String, unique=True, nullable=True)
    hubspot_owner_id = Column(String, unique=True, nullable=True)

    calendars = relationship("SalesRepCalendar", back_populates="sales_rep", cascade="all, delete-orphan")
    deals = relationship("Deal", back_populates="sales_rep")
    meetings = relationship("Meeting", secondary=meeting_sales_rep, back_populates="sales_reps")
