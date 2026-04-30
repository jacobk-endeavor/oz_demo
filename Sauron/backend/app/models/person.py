from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.associations import meeting_person


class Person(Base):
    __tablename__ = "people"

    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    title = Column(String, nullable=True)
    linkedin = Column(String, nullable=True)
    hubspot_contact_id = Column(String, unique=True, nullable=True)

    meetings = relationship("Meeting", secondary=meeting_person, back_populates="people")
