from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.associations import (
    meeting_recording_company,
    meeting_recording_person,
    meeting_recording_sales_rep,
)


class MeetingRecording(Base):
    __tablename__ = "meeting_recordings"

    id = Column(Integer, primary_key=True, index=True)
    engagement_id = Column(String, unique=True, nullable=False, index=True)
    title = Column(String, nullable=False)
    summary = Column(Text, nullable=True)
    transcript = Column(Text, nullable=False)
    start_at = Column(DateTime(timezone=True), nullable=True)
    meeting_id = Column(
        Integer,
        ForeignKey("meetings.id"),
        nullable=True,
        index=True,
    )

    companies = relationship(
        "Company",
        secondary=meeting_recording_company,
        backref="meeting_recordings",
    )
    people = relationship(
        "Person",
        secondary=meeting_recording_person,
        backref="meeting_recordings",
    )
    sales_reps = relationship(
        "SalesRep",
        secondary=meeting_recording_sales_rep,
        backref="meeting_recordings",
    )
    meeting = relationship("Meeting", back_populates="meeting_recordings")
