import unittest
from datetime import datetime, timezone
from types import SimpleNamespace

from app.models.enums import EmailDirection
from app.routers.company_emails import (
    _build_thread_detail,
    _build_thread_list_item,
)


def _company(company_id: int, name: str) -> SimpleNamespace:
    return SimpleNamespace(id=company_id, name=name)


def _user(user_id: int, email: str, first_name: str, last_name: str) -> SimpleNamespace:
    return SimpleNamespace(
        id=user_id,
        email=email,
        first_name=first_name,
        last_name=last_name,
    )


def _email(
    *,
    email_id: int,
    hubspot_email_id: str,
    occurred_at: datetime,
    hubspot_thread_id: str | None,
    subject: str,
    body_preview: str,
    from_email: str,
    to_emails: list[str],
    companies: list[SimpleNamespace],
    users: list[SimpleNamespace],
    thread_summary: str | None = None,
    forwarded_subthread: bool | None = None,
) -> SimpleNamespace:
    owner_user = users[0] if users else None
    return SimpleNamespace(
        id=email_id,
        hubspot_email_id=hubspot_email_id,
        hubspot_thread_id=hubspot_thread_id,
        hubspot_message_id=f"message-{email_id}",
        hubspot_thread_summary=thread_summary,
        hubspot_member_of_forwarded_subthread=forwarded_subthread,
        direction=EmailDirection.SENT,
        hubspot_direction="EMAIL",
        hubspot_status="SENT",
        subject=subject,
        body_preview=body_preview,
        from_email=from_email,
        to_emails=to_emails,
        cc_emails=[],
        bcc_emails=[],
        participant_emails=[from_email, *to_emails],
        occurred_at=occurred_at,
        hubspot_url=f"https://app.hubspot.com/email/{hubspot_email_id}",
        companies=companies,
        users=users,
        owner_user=owner_user,
        owner_sales_rep=None,
        hubspot_owner_id="42" if owner_user else None,
    )


class CompanyEmailThreadsTest(unittest.TestCase):
    def test_build_thread_list_item_uses_latest_message_and_aggregates_metadata(self) -> None:
        first_message = _email(
            email_id=1,
            hubspot_email_id="111",
            occurred_at=datetime(2026, 3, 10, 9, 0, tzinfo=timezone.utc),
            hubspot_thread_id="thread-abc",
            subject="Intro",
            body_preview="Starting the conversation",
            from_email="seller@endeavorai.com",
            to_emails=["buyer@acme.com"],
            companies=[_company(2, "Beta"), _company(1, "Acme")],
            users=[_user(10, "seller@endeavorai.com", "Seller", "User")],
            thread_summary="Pricing discussion",
        )
        latest_message = _email(
            email_id=2,
            hubspot_email_id="222",
            occurred_at=datetime(2026, 3, 11, 9, 30, tzinfo=timezone.utc),
            hubspot_thread_id="thread-abc",
            subject="Re: Intro",
            body_preview="Following up with details",
            from_email="buyer@acme.com",
            to_emails=["seller@endeavorai.com"],
            companies=[_company(1, "Acme")],
            users=[
                _user(11, "ae@endeavorai.com", "Alice", "Example"),
                _user(10, "seller@endeavorai.com", "Seller", "User"),
            ],
        )

        item = _build_thread_list_item("thread-abc", [first_message, latest_message])

        self.assertEqual(item.thread_key, "thread-abc")
        self.assertEqual(item.message_count, 2)
        self.assertEqual(item.latest_message.id, 2)
        self.assertEqual(item.hubspot_thread_summary, "Pricing discussion")
        self.assertEqual([company.name for company in item.companies], ["Acme", "Beta"])
        self.assertEqual(
            [user.display_name for user in item.users],
            ["Alice Example", "Seller User"],
        )

    def test_build_thread_detail_returns_chronological_chain(self) -> None:
        first_message = _email(
            email_id=1,
            hubspot_email_id="111",
            occurred_at=datetime(2026, 3, 10, 9, 0, tzinfo=timezone.utc),
            hubspot_thread_id="thread-xyz",
            subject="Kickoff",
            body_preview="Initial note",
            from_email="seller@endeavorai.com",
            to_emails=["buyer@acme.com"],
            companies=[_company(1, "Acme")],
            users=[_user(10, "seller@endeavorai.com", "Seller", "User")],
            thread_summary="Renewal discussion",
        )
        latest_message = _email(
            email_id=2,
            hubspot_email_id="222",
            occurred_at=datetime(2026, 3, 11, 14, 15, tzinfo=timezone.utc),
            hubspot_thread_id="thread-xyz",
            subject="Re: Kickoff",
            body_preview="More details",
            from_email="buyer@acme.com",
            to_emails=["seller@endeavorai.com"],
            companies=[_company(1, "Acme")],
            users=[_user(10, "seller@endeavorai.com", "Seller", "User")],
            forwarded_subthread=True,
        )

        thread = _build_thread_detail("thread-xyz", [latest_message, first_message])

        self.assertEqual(thread.thread_key, "thread-xyz")
        self.assertEqual(thread.message_count, 2)
        self.assertEqual([message.id for message in thread.messages], [1, 2])
        self.assertTrue(thread.messages[1].hubspot_member_of_forwarded_subthread)
        self.assertEqual(thread.hubspot_thread_summary, "Renewal discussion")

    def test_build_thread_detail_keeps_real_thread_id_when_companion_is_unthreaded(self) -> None:
        threaded_message = _email(
            email_id=1,
            hubspot_email_id="111",
            occurred_at=datetime(2026, 3, 11, 18, 43, 52, tzinfo=timezone.utc),
            hubspot_thread_id="thread-real",
            subject="AI Quoting",
            body_preview="Actual HubSpot-threaded message",
            from_email="mpj@endeavorai.com",
            to_emails=["cfletcher@plumbers-supply-co.com"],
            companies=[_company(1, "Plumbers Supply Co.")],
            users=[_user(10, "mpj@endeavorai.com", "Michael-Paul", "Jenkins")],
            thread_summary="AI Quoting",
        )
        companion_message = _email(
            email_id=2,
            hubspot_email_id="222",
            occurred_at=datetime(2026, 3, 11, 18, 43, 39, tzinfo=timezone.utc),
            hubspot_thread_id=None,
            subject="Email: AI Quoting",
            body_preview="Companion email row missing a thread id",
            from_email="mpj@endeavorai.com",
            to_emails=["cfletcher@plumbers-supply-co.com"],
            companies=[_company(1, "Plumbers Supply Co.")],
            users=[_user(10, "mpj@endeavorai.com", "Michael-Paul", "Jenkins")],
        )

        thread = _build_thread_detail(
            "thread-real",
            [threaded_message, companion_message],
        )

        self.assertEqual(thread.thread_key, "thread-real")
        self.assertEqual(thread.hubspot_thread_id, "thread-real")
        self.assertEqual(thread.message_count, 2)
        self.assertEqual([message.id for message in thread.messages], [2, 1])


if __name__ == "__main__":
    unittest.main()
