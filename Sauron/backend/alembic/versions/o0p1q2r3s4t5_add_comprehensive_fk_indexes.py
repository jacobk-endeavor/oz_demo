"""add comprehensive fk indexes

Revision ID: o0p1q2r3s4t5
Revises: n9o0p1q2r3s4
Create Date: 2026-03-04 19:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "o0p1q2r3s4t5"
down_revision: Union[str, Sequence[str], None] = "n9o0p1q2r3s4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_INDEXES = [
    ("ix_positions_person_id", "positions", ["person_id"]),
    ("ix_positions_pe_group_id", "positions", ["pe_group_id"]),
    ("ix_positions_industry_group_id", "positions", ["industry_group_id"]),
    ("ix_companies_parent_company_id", "companies", ["parent_company_id"]),
    ("ix_donations_person_id", "donations", ["person_id"]),
    ("ix_leads_user_id", "leads", ["user_id"]),
    ("ix_sales_rep_calendars_sales_rep_id", "sales_rep_calendars", ["sales_rep_id"]),
    ("ix_contact_experiences_contact_id", "contact_experiences", ["contact_id"]),
    ("ix_deals_company_id", "deals", ["company_id"]),
    ("ix_deals_sales_rep_id", "deals", ["sales_rep_id"]),
    ("ix_deal_participants_deal_id", "deal_participants", ["deal_id"]),
    ("ix_deal_participants_person_id", "deal_participants", ["person_id"]),
    ("ix_event_visits_company_company_id", "event_visits_company", ["company_id"]),
    ("ix_event_visits_company_event_id", "event_visits_company", ["event_id"]),
    ("ix_event_visits_person_person_id", "event_visits_person", ["person_id"]),
    ("ix_event_visits_person_event_id", "event_visits_person", ["event_id"]),
    ("ix_company_industry_group_industry_group_id", "company_industry_group", ["industry_group_id"]),
    ("ix_pe_group_company_company_id", "pe_group_company", ["company_id"]),
    ("ix_meeting_recording_company_company_id", "meeting_recording_company", ["company_id"]),
    ("ix_meeting_recording_person_person_id", "meeting_recording_person", ["person_id"]),
]


def upgrade() -> None:
    for name, table, columns in _INDEXES:
        op.create_index(name, table, columns)


def downgrade() -> None:
    for name, table, _ in reversed(_INDEXES):
        op.drop_index(name, table_name=table)
