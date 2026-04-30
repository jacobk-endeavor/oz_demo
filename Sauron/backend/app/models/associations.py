from sqlalchemy import Table, Column, ForeignKey, Integer

from app.database import Base

company_industry_group = Table(
    "company_industry_group",
    Base.metadata,
    Column("company_id", Integer, ForeignKey("companies.id"), primary_key=True),
    Column("industry_group_id", Integer, ForeignKey("industry_groups.id"), primary_key=True),
)

pe_group_company = Table(
    "pe_group_company",
    Base.metadata,
    Column("pe_group_id", Integer, ForeignKey("pe_groups.id"), primary_key=True),
    Column("company_id", Integer, ForeignKey("companies.id"), primary_key=True),
)

meeting_company = Table(
    "meeting_company",
    Base.metadata,
    Column("meeting_id", Integer, ForeignKey("meetings.id"), primary_key=True),
    Column("company_id", Integer, ForeignKey("companies.id"), primary_key=True),
)

meeting_person = Table(
    "meeting_person",
    Base.metadata,
    Column("meeting_id", Integer, ForeignKey("meetings.id"), primary_key=True),
    Column("person_id", Integer, ForeignKey("people.id"), primary_key=True),
)

meeting_sales_rep = Table(
    "meeting_sales_rep",
    Base.metadata,
    Column("meeting_id", Integer, ForeignKey("meetings.id"), primary_key=True),
    Column("sales_rep_id", Integer, ForeignKey("sales_reps.id"), primary_key=True),
)

meeting_recording_company = Table(
    "meeting_recording_company",
    Base.metadata,
    Column(
        "meeting_recording_id",
        Integer,
        ForeignKey("meeting_recordings.id"),
        primary_key=True,
    ),
    Column("company_id", Integer, ForeignKey("companies.id"), primary_key=True),
)

meeting_recording_person = Table(
    "meeting_recording_person",
    Base.metadata,
    Column(
        "meeting_recording_id",
        Integer,
        ForeignKey("meeting_recordings.id"),
        primary_key=True,
    ),
    Column("person_id", Integer, ForeignKey("people.id"), primary_key=True),
)

meeting_recording_sales_rep = Table(
    "meeting_recording_sales_rep",
    Base.metadata,
    Column(
        "meeting_recording_id",
        Integer,
        ForeignKey("meeting_recordings.id"),
        primary_key=True,
    ),
    Column("sales_rep_id", Integer, ForeignKey("sales_reps.id"), primary_key=True),
)

company_email_company = Table(
    "company_email_companies",
    Base.metadata,
    Column(
        "company_email_id",
        Integer,
        ForeignKey("company_emails.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "company_id",
        Integer,
        ForeignKey("companies.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)

company_email_user = Table(
    "company_email_users",
    Base.metadata,
    Column(
        "company_email_id",
        Integer,
        ForeignKey("company_emails.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "user_id",
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)
