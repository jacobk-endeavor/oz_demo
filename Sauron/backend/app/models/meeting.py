from sqlalchemy import Column, DateTime, Integer, JSON, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base
from app.models.associations import meeting_company, meeting_person, meeting_sales_rep


class Meeting(Base):
    __tablename__ = "meetings"

    id = Column(Integer, primary_key=True, index=True)
    # Source calendar UID (series-level identifier, not always per-instance unique).
    external_uid = Column(String, nullable=False, index=True)
    # Internal instance-level identifier used for upsert identity.
    instance_uid = Column(String, unique=True, nullable=False, index=True)
    # Normalized recurrence-id for recurring instances when available.
    recurrence_id = Column(String, nullable=True)
    title = Column(String, nullable=False)
    start_at = Column(DateTime(timezone=True), nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    summary = Column(Text, nullable=True)
    description = Column(Text, nullable=True)
    meeting_url = Column(String, nullable=True)
    location = Column(String, nullable=True)
    revision_history = Column(JSON, nullable=False, default=list)
    last_revision_sequence = Column(Integer, nullable=True)
    last_attendee_digest = Column(String(64), nullable=True)
    last_synced_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    cancelled_at = Column(DateTime(timezone=True), nullable=True, index=True)

    sales_reps = relationship("SalesRep", secondary=meeting_sales_rep, back_populates="meetings")
    people = relationship("Person", secondary=meeting_person, back_populates="meetings")
    companies = relationship("Company", secondary=meeting_company, back_populates="meetings")
    meeting_recordings = relationship("MeetingRecording", back_populates="meeting")
