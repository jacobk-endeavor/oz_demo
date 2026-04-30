from sqlalchemy import Column, Integer, Boolean, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base


class EventVisitCompany(Base):
    __tablename__ = "event_visits_company"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False)
    is_sponsor = Column(Boolean, default=False)

    company = relationship("Company", backref="event_visits")
    event = relationship("Event", backref="company_visits")


class EventVisitPerson(Base):
    __tablename__ = "event_visits_person"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("people.id"), nullable=False)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False)
    is_keynote_speaker = Column(Boolean, default=False)

    person = relationship("Person", backref="event_visits")
    event = relationship("Event", backref="person_visits")
