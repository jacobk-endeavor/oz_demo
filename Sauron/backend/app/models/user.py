from sqlalchemy import Column, Enum, Integer, String

from app.database import Base
from app.models.associations import company_email_user
from app.models.enums import UserRole
from sqlalchemy.orm import relationship


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    nick_name = Column(String, nullable=True)
    password = Column(String, nullable=False)
    role = Column(
        Enum(UserRole, name="userrole", values_callable=lambda e: [i.value for i in e]),
        nullable=False,
        server_default="bdr",
    )
    color = Column(String, nullable=True)
    phone_number = Column(String, nullable=True)

    company_emails = relationship(
        "CompanyEmail",
        secondary=company_email_user,
        back_populates="users",
    )
