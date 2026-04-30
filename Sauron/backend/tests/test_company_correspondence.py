import unittest
from datetime import datetime, timezone
from types import SimpleNamespace

from app.models.enums import EmailDirection
from app.routers.companies import _serialize_company_correspondence_item


class CompanyCorrespondenceSerializationTest(unittest.TestCase):
    def test_serialize_company_correspondence_item(self) -> None:
        email = SimpleNamespace(
            id=5,
            hubspot_email_id="12345",
            direction=EmailDirection.SENT,
            hubspot_direction="EMAIL",
            hubspot_status="SENT",
            subject="Follow-up",
            body_preview="Checking in with Acme.",
            from_email="ryan@endeavorai.com",
            to_emails=["buyer@acme.com"],
            cc_emails=["ae@endeavorai.com"],
            bcc_emails=[],
            participant_emails=[
                "ryan@endeavorai.com",
                "buyer@acme.com",
                "ae@endeavorai.com",
            ],
            occurred_at=datetime(2026, 3, 11, 12, 30, tzinfo=timezone.utc),
            hubspot_url="https://app.hubspot.com/email/12345",
            hubspot_owner_id="99",
            owner_user=SimpleNamespace(
                id=7,
                email="ryan@endeavorai.com",
                first_name="Ryan",
                last_name="Huang",
            ),
            owner_sales_rep=None,
            users=[
                SimpleNamespace(
                    id=8,
                    email="ae@endeavorai.com",
                    first_name="Alice",
                    last_name="Example",
                ),
                SimpleNamespace(
                    id=7,
                    email="ryan@endeavorai.com",
                    first_name="Ryan",
                    last_name="Huang",
                ),
            ],
        )

        item = _serialize_company_correspondence_item(email)

        self.assertEqual(item.id, 5)
        self.assertEqual(item.hubspot_email_id, "12345")
        self.assertEqual(item.direction, EmailDirection.SENT)
        self.assertEqual(item.owner.user_id, 7)
        self.assertEqual(item.owner.display_name, "Ryan Huang")
        self.assertEqual(
            [user.display_name for user in item.users],
            ["Alice Example", "Ryan Huang"],
        )


if __name__ == "__main__":
    unittest.main()
