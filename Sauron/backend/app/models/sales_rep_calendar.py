from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class SalesRepCalendar(Base):
    __tablename__ = "sales_rep_calendars"

    id = Column(Integer, primary_key=True, index=True)
    sales_rep_id = Column(Integer, ForeignKey("sales_reps.id", ondelete="CASCADE"), nullable=False)
    label = Column(String, nullable=False)
    calendar_url = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    sales_rep = relationship("SalesRep", back_populates="calendars")
