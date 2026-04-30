from __future__ import annotations

import asyncio
import base64
import logging
import re
from datetime import datetime, timezone

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session
from app.models.enums import ActionCategory, EmailDirection
from app.models.gmail_credential import GmailCredential
from app.models.lead import LeadAction, LeadContact
from app.models.lead_email import LeadEmail
from app.services.gmail_client import GmailClientService, connection_key_for_user

logger = logging.getLogger(__name__)

_EMAIL_RE = re.compile(r"<([^>]+)>")
_NOTES_TRUNCATE = 500


def _extract_email_address(header_value: str) -> str:
    m = _EMAIL_RE.search(header_value)
    return m.group(1).lower() if m else header_value.strip().lower()


def _extract_plain_body(payload: dict) -> str | None:
    if payload.get("mimeType") == "text/plain":
        data = payload.get("body", {}).get("data")
        if data:
            return base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")
    for part in payload.get("parts", []):
        body = _extract_plain_body(part)
        if body:
            return body
    return None


def _headers_to_map(headers: list[dict]) -> dict[str, str]:
    out: dict[str, str] = {}
    for h in headers:
        name = (h.get("name") or "").lower()
        value = h.get("value")
        if name and value and name not in out:
            out[name] = value
    return out


def _build_gmail_service(credentials: Credentials):
    return build("gmail", "v1", credentials=credentials, cache_discovery=False)


def _build_thread_sender_map(sent_rows: list) -> dict[str, int]:
    """Build thread_id -> sent_by_user_id from already lead-scoped sent rows."""
    out: dict[str, int] = {}
    for r in sent_rows:
        if r.sent_by_user_id and r.gmail_thread_id:
            out[r.gmail_thread_id] = r.sent_by_user_id
    return out


class EmailSyncService:
    """Syncs replies by fetching only the Gmail threads we initiated."""

    def __init__(self, db: AsyncSession):
        self._db = db

    async def sync_for_lead(
        self,
        lead_id: int,
        *,
        sender_user_id: int | None = None,
    ) -> int:
        """Fetch new replies in threads we started for a single lead."""
        query = select(
            LeadEmail.gmail_thread_id,
            LeadEmail.to_email,
            LeadEmail.contact_id,
            LeadEmail.sent_by_user_id,
        ).where(
            LeadEmail.lead_id == lead_id,
            LeadEmail.direction == EmailDirection.SENT,
            LeadEmail.gmail_thread_id.isnot(None),
        )
        if sender_user_id is not None:
            query = query.where(LeadEmail.sent_by_user_id == sender_user_id)

        sent_rows = (await self._db.execute(query)).all()
        if not sent_rows:
            return 0

        rows_by_sender: dict[int, list] = {}
        for row in sent_rows:
            if row.sent_by_user_id is None:
                continue
            rows_by_sender.setdefault(row.sent_by_user_id, []).append(row)
        if not rows_by_sender:
            return 0

        count = 0
        for user_id, rows in rows_by_sender.items():
            credentials = await self._get_gmail_credentials(user_id)
            if credentials is None:
                continue
            thread_ids = {r.gmail_thread_id for r in rows}
            addr_map = await self._build_addr_map(lead_id, rows)
            thread_to_sender = _build_thread_sender_map(rows)
            count += await self._sync_threads(
                lead_id,
                thread_ids,
                addr_map,
                thread_to_sender,
                credentials,
            )
        logger.info("On-demand email sync for lead %d: %d new email(s)", lead_id, count)
        return count

    async def sync_all(self) -> int:
        """Poll Gmail for replies in all threads we've initiated across all leads."""
        sent_rows = (
            await self._db.execute(
                select(
                    LeadEmail.lead_id,
                    LeadEmail.gmail_thread_id,
                    LeadEmail.to_email,
                    LeadEmail.contact_id,
                    LeadEmail.sent_by_user_id,
                ).where(
                    LeadEmail.direction == EmailDirection.SENT,
                    LeadEmail.gmail_thread_id.isnot(None),
                    LeadEmail.sent_by_user_id.isnot(None),
                )
            )
        ).all()
        if not sent_rows:
            return 0

        by_lead_and_sender: dict[tuple[int, int], list] = {}
        for row in sent_rows:
            if row.sent_by_user_id is None:
                continue
            key = (row.lead_id, row.sent_by_user_id)
            by_lead_and_sender.setdefault(key, []).append(row)
        if not by_lead_and_sender:
            return 0

        credentials_cache: dict[int, Credentials | None] = {}

        total = 0
        for (lead_id, sender_user_id), rows in by_lead_and_sender.items():
            credentials = credentials_cache.get(sender_user_id)
            if sender_user_id not in credentials_cache:
                credentials = await self._get_gmail_credentials(sender_user_id)
                credentials_cache[sender_user_id] = credentials
            if credentials is None:
                continue

            thread_ids = {r.gmail_thread_id for r in rows}
            addr_map = await self._build_addr_map(lead_id, rows)
            thread_to_sender = _build_thread_sender_map(rows)
            total += await self._sync_threads(lead_id, thread_ids, addr_map, thread_to_sender, credentials)
        return total

    # ------------------------------------------------------------------
    # internals
    # ------------------------------------------------------------------

    async def _build_addr_map(self, lead_id: int, sent_rows: list) -> dict[str, object | None]:
        """Map each recipient address to its LeadContact (or None for custom addresses)."""
        emails = {r.to_email.lower() for r in sent_rows}
        contact_rows = (
            await self._db.execute(
                select(LeadContact.id, LeadContact.email, LeadContact.first_name, LeadContact.last_name)
                .where(LeadContact.lead_id == lead_id, func.lower(LeadContact.email).in_(emails))
            )
        ).all()
        addr_map: dict[str, object | None] = {r.email.lower(): r for r in contact_rows}
        for email in emails:
            addr_map.setdefault(email, None)
        return addr_map

    async def _sync_threads(
        self,
        lead_id: int,
        thread_ids: set[str],
        addr_map: dict[str, object | None],
        thread_to_sender: dict[str, int],
        credentials: Credentials,
    ) -> int:
        all_msgs: list[dict] = []
        for tid in thread_ids:
            try:
                msgs = await asyncio.to_thread(self._get_thread_messages, credentials, tid)
                all_msgs.extend(msgs)
            except HttpError as exc:
                if exc.resp.status == 404:
                    logger.debug("Thread %s no longer exists in Gmail; skipping", tid)
                else:
                    logger.exception("Failed to fetch thread %s", tid)
            except Exception:
                logger.exception("Failed to fetch thread %s", tid)
        if not all_msgs:
            return 0

        existing = set(
            (await self._db.execute(
                select(LeadEmail.gmail_message_id)
                .where(LeadEmail.gmail_message_id.in_([m["id"] for m in all_msgs]))
            )).scalars().all()
        )
        new_msgs = [m for m in all_msgs if m["id"] not in existing]
        if not new_msgs:
            return 0

        count = 0
        for msg in new_msgs:
            try:
                count += await self._ingest_message(msg, lead_id, addr_map, thread_to_sender)
            except Exception:
                logger.exception("Failed to ingest message %s", msg.get("id"))
        if count:
            await self._db.commit()
        return count

    async def _ingest_message(
        self,
        msg: dict,
        lead_id: int,
        addr_map: dict[str, object | None],
        thread_to_sender: dict[str, int],
    ) -> int:
        headers = _headers_to_map(msg.get("payload", {}).get("headers", []))
        from_email = _extract_email_address(headers.get("from", ""))

        if from_email not in addr_map:
            return 0

        contact = addr_map[from_email]
        thread_id = msg.get("threadId")
        sender_user_id = thread_to_sender.get(thread_id) if thread_id else None
        if sender_user_id is None:
            logger.warning("No sender user found for thread %s; skipping", thread_id)
            return 0

        subject = headers.get("subject", "(no subject)")
        body = _extract_plain_body(msg.get("payload", {}))
        internal_date = msg.get("internalDate")
        occurred_at = (
            datetime.fromtimestamp(int(internal_date) / 1000, tz=timezone.utc)
            if internal_date else datetime.now(timezone.utc)
        )
        contact_name = (
            " ".join(p for p in [contact.first_name, contact.last_name] if p)
            if contact else from_email
        )

        action = LeadAction(
            lead_id=lead_id,
            user_id=sender_user_id,
            contact_id=contact.id if contact else None,
            category=ActionCategory.EMAIL,
            title=f"Email received from {contact_name}: {subject}",
            notes=body[:_NOTES_TRUNCATE] if body else None,
            occurred_at=occurred_at,
        )
        self._db.add(action)
        await self._db.flush()

        self._db.add(LeadEmail(
            lead_id=lead_id,
            contact_id=contact.id if contact else None,
            lead_action_id=action.id,
            gmail_message_id=msg["id"],
            gmail_thread_id=thread_id,
            direction=EmailDirection.RECEIVED,
            from_email=from_email,
            to_email=_extract_email_address(headers.get("to", "")),
            subject=subject,
            body_plain=body,
            occurred_at=occurred_at,
        ))
        return 1

    async def _get_gmail_credentials(self, user_id: int) -> Credentials | None:
        cred = (
            await self._db.execute(
                select(GmailCredential)
                .where(GmailCredential.connection_key == connection_key_for_user(user_id))
            )
        ).scalar_one_or_none()
        if not cred:
            return None
        gmail_svc = GmailClientService(self._db)
        credentials = gmail_svc._credentials_from_credential(cred)
        try:
            await gmail_svc._refresh_credentials_if_needed(cred, credentials)
        except Exception:
            logger.warning(
                "Failed to refresh Gmail credentials during sync for user %d",
                user_id,
            )
            return None
        return credentials

    @staticmethod
    def _get_thread_messages(credentials: Credentials, thread_id: str) -> list[dict]:
        svc = _build_gmail_service(credentials)
        thread = svc.users().threads().get(
            userId="me", id=thread_id, format="full",
        ).execute()
        return thread.get("messages", [])


async def run_periodic_email_sync(*, run_immediately: bool = True) -> None:
    interval = max(settings.email_sync_interval_seconds, 60)
    first = True
    while True:
        if first and not run_immediately:
            await asyncio.sleep(interval)
        first = False

        started = datetime.now(timezone.utc)
        try:
            async with async_session() as db:
                count = await EmailSyncService(db).sync_all()
                logger.info("Email sync tick: %d new email(s)", count)
        except asyncio.CancelledError:
            logger.info("Email sync loop cancelled")
            raise
        except Exception:
            logger.exception("Email sync tick failed; will retry")

        elapsed = (datetime.now(timezone.utc) - started).total_seconds()
        await asyncio.sleep(max(interval - elapsed, 0))
