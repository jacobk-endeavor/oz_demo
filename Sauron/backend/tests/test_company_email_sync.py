import unittest
from types import SimpleNamespace

from app.models.enums import EmailDirection
from app.services.company_email_sync import (
    _parse_bool,
    _parse_addresses,
    email_has_changes,
    infer_direction,
    resolve_email_associations,
)


class CompanyEmailSyncHelpersTest(unittest.TestCase):
    def test_parse_addresses_normalizes_and_dedupes(self) -> None:
        parsed = _parse_addresses(
            "Ryan <Ryan@EndeavorAI.com>; buyer@acme.com, Buyer <buyer@acme.com>"
        )
        self.assertEqual(parsed, ["ryan@endeavorai.com", "buyer@acme.com"])

    def test_parse_bool_accepts_hubspot_style_values(self) -> None:
        self.assertTrue(_parse_bool("true"))
        self.assertFalse(_parse_bool("FALSE"))
        self.assertTrue(_parse_bool(1))
        self.assertFalse(_parse_bool(0))
        self.assertIsNone(_parse_bool(""))
        self.assertIsNone(_parse_bool(None))

    def test_resolve_email_associations_matches_users_and_company_domains(self) -> None:
        users_by_email = {
            "ryan@endeavorai.com": SimpleNamespace(id=7),
        }
        company_ids, user_ids = resolve_email_associations(
            participant_emails=[
                "ryan@endeavorai.com",
                "buyer@acme.com",
                "friend@gmail.com",
            ],
            users_by_email=users_by_email,
            domain_to_company_id={"acme.com": 42},
            owner_user_id=11,
        )

        self.assertEqual(company_ids, {42})
        self.assertEqual(user_ids, {7, 11})

    def test_infer_direction_prefers_internal_sender(self) -> None:
        direction = infer_direction(
            from_email="ryan@endeavorai.com",
            to_emails=["buyer@acme.com"],
            cc_emails=[],
            bcc_emails=[],
            internal_user_emails={"ryan@endeavorai.com"},
            owner_user_id=None,
        )
        self.assertEqual(direction, EmailDirection.SENT)

    def test_infer_direction_uses_internal_recipient_for_received(self) -> None:
        direction = infer_direction(
            from_email="buyer@acme.com",
            to_emails=["ryan@endeavorai.com"],
            cc_emails=[],
            bcc_emails=[],
            internal_user_emails={"ryan@endeavorai.com"},
            owner_user_id=None,
        )
        self.assertEqual(direction, EmailDirection.RECEIVED)

    def test_email_has_changes_detects_idempotent_sync(self) -> None:
        payload = {
            "subject": "Hello",
            "from_email": "ryan@endeavorai.com",
            "to_emails": ["buyer@acme.com"],
            "hubspot_thread_id": "thread-1",
        }
        existing = SimpleNamespace(**payload)

        self.assertFalse(
            email_has_changes(
                existing_email=existing,
                payload=payload,
                current_company_ids={42},
                desired_company_ids={42},
                current_user_ids={7},
                desired_user_ids={7},
            )
        )
        self.assertTrue(
            email_has_changes(
                existing_email=existing,
                payload={**payload, "hubspot_thread_id": "thread-2"},
                current_company_ids={42},
                desired_company_ids={42},
                current_user_ids={7},
                desired_user_ids={7},
            )
        )


if __name__ == "__main__":
    unittest.main()
