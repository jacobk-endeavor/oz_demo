from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from email.utils import getaddresses

import httpx
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.associations import company_email_company, company_email_user
from app.models.company_email import CompanyEmail, CompanyEmailSyncState
from app.models.entity_domain import EntityDomain
from app.models.enums import EmailDirection
from app.models.sales_rep import SalesRep
from app.models.user import User
from app.services.calendar_sync.models import (
    extract_domain_from_email,
    is_personal_email_domain,
    normalize_email,
)

logger = logging.getLogger(__name__)

_BASE_URL = "https://api.hubapi.com"
_MAX_ATTEMPTS = 4
_MAX_PAGE_SIZE = 200
_SYNC_PROVIDER = "hubspot"
_BOOTSTRAP_DAYS = 30
_CURSOR_OVERLAP = timedelta(minutes=5)

EMAIL_PROPERTIES = [
    "hs_createdate",
    "hs_lastmodifieddate",
    "hs_timestamp",
    "hs_email_direction",
    "hs_email_thread_id",
    "hs_email_message_id",
    "hs_email_thread_summary",
    "hs_email_member_of_forwarded_subthread",
    "hs_email_status",
    "hs_email_subject",
    "hs_body_preview",
    "hs_email_from_email",
    "hs_email_to_email",
    "hs_email_cc_email",
    "hs_email_bcc_email",
    "hubspot_owner_id",
]


class CompanyEmailSyncStats(BaseModel):
    emails_created: int = 0
    emails_updated: int = 0
    emails_unchanged: int = 0
    company_links_upserted: int = 0
    user_links_upserted: int = 0
    failed: int = 0
    last_modified_at: datetime | None = None

    @property
    def emails_synced(self) -> int:
        return self.emails_created + self.emails_updated + self.emails_unchanged


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def _to_millis(dt: datetime) -> str:
    return str(int(dt.timestamp() * 1000))


def _parse_bool(value: object) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)

    normalized = str(value).strip().lower()
    if not normalized:
        return None
    if normalized in {"true", "1", "yes"}:
        return True
    if normalized in {"false", "0", "no"}:
        return False
    return None


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        if item and item not in seen:
            seen.add(item)
            out.append(item)
    return out


def _parse_addresses(raw_value: str | None) -> list[str]:
    if not raw_value:
        return []
    normalized_value = raw_value.replace(";", ",")
    emails = [
        normalized
        for _, addr in getaddresses([normalized_value])
        if (normalized := normalize_email(addr))
    ]
    return _dedupe(emails)


def infer_direction(
    *,
    from_email: str | None,
    to_emails: list[str],
    cc_emails: list[str],
    bcc_emails: list[str],
    internal_user_emails: set[str],
    owner_user_id: int | None,
) -> EmailDirection:
    recipient_emails = set(to_emails + cc_emails + bcc_emails)
    if from_email and from_email in internal_user_emails:
        return EmailDirection.SENT
    if recipient_emails.intersection(internal_user_emails):
        return EmailDirection.RECEIVED
    if owner_user_id is not None:
        return EmailDirection.SENT
    return EmailDirection.RECEIVED


def resolve_email_associations(
    *,
    participant_emails: list[str],
    users_by_email: dict[str, object],
    domain_to_company_id: dict[str, int],
    owner_user_id: int | None,
) -> tuple[set[int], set[int]]:
    internal_user_emails = set(users_by_email.keys())
    user_ids = {
        user.id
        for email in participant_emails
        if (user := users_by_email.get(email)) is not None
    }
    if owner_user_id is not None:
        user_ids.add(owner_user_id)

    company_ids: set[int] = set()
    for email in participant_emails:
        if email in internal_user_emails:
            continue
        domain = extract_domain_from_email(email)
        if not domain or is_personal_email_domain(domain):
            continue
        company_id = domain_to_company_id.get(domain)
        if company_id is not None:
            company_ids.add(company_id)
    return company_ids, user_ids


def email_has_changes(
    *,
    existing_email: CompanyEmail,
    payload: dict,
    current_company_ids: set[int],
    desired_company_ids: set[int],
    current_user_ids: set[int],
    desired_user_ids: set[int],
) -> bool:
    for key, value in payload.items():
        if getattr(existing_email, key) != value:
            return True
    return (
        current_company_ids != desired_company_ids
        or current_user_ids != desired_user_ids
    )


class HubSpotCompanyEmailSyncService:
    def __init__(
        self,
        db: AsyncSession,
        client: httpx.AsyncClient,
        *,
        access_token: str,
        page_size: int = _MAX_PAGE_SIZE,
    ) -> None:
        self._db = db
        self._client = client
        self._access_token = access_token
        self._page_size = max(1, min(page_size, _MAX_PAGE_SIZE))

    async def run_incremental(self) -> CompanyEmailSyncStats:
        state = await self._get_or_create_state()
        started_at = datetime.now(timezone.utc)
        state.last_run_at = started_at
        await self._db.commit()

        if state.last_modified_at:
            start_at = state.last_modified_at - _CURSOR_OVERLAP
        else:
            start_at = started_at - timedelta(days=_BOOTSTRAP_DAYS)
        end_at = started_at

        try:
            stats = await self.sync_range(start_at=start_at, end_at=end_at)
        except Exception as exc:
            state.last_error = str(exc)
            await self._db.commit()
            raise

        if stats.last_modified_at and (
            state.last_modified_at is None or stats.last_modified_at > state.last_modified_at
        ):
            state.last_modified_at = stats.last_modified_at
        state.last_successful_run_at = datetime.now(timezone.utc)
        state.last_error = None
        await self._db.commit()
        return stats

    async def find_oldest_email_timestamp(self) -> datetime | None:
        data = await self._api_post(
            "/crm/v3/objects/emails/search",
            json_body={
                "sorts": [
                    {
                        "propertyName": "hs_createdate",
                        "direction": "ASCENDING",
                    }
                ],
                "properties": ["hs_createdate", "hs_timestamp"],
                "limit": 1,
            },
        )
        results = data.get("results", [])
        if not results:
            return None

        first = results[0]
        properties = first.get("properties", {})
        return (
            _parse_datetime(properties.get("hs_createdate"))
            or _parse_datetime(properties.get("hs_timestamp"))
            or _parse_datetime(first.get("createdAt"))
        )

    async def sync_range(
        self,
        *,
        start_at: datetime,
        end_at: datetime,
    ) -> CompanyEmailSyncStats:
        if end_at <= start_at:
            return CompanyEmailSyncStats()

        stats = CompanyEmailSyncStats()
        domain_to_company_id = await self._load_domain_map()
        users_by_email = await self._load_users_by_email()
        internal_user_emails = set(users_by_email.keys())
        sales_reps_by_owner_id = await self._load_sales_reps_by_owner_id()

        after: str | None = None
        total: int | None = None
        while True:
            data = await self._search_emails(
                start_at=start_at,
                end_at=end_at,
                after=after,
            )
            if total is None:
                total = int(data.get("total", 0) or 0)
                if total > 10_000:
                    raise ValueError(
                        "HubSpot email sync window exceeds 10,000 results. "
                        "Run the backfill script with a smaller date window."
                    )

            batch = data.get("results", [])
            if batch:
                await self._sync_batch(
                    batch,
                    stats=stats,
                    domain_to_company_id=domain_to_company_id,
                    users_by_email=users_by_email,
                    internal_user_emails=internal_user_emails,
                    sales_reps_by_owner_id=sales_reps_by_owner_id,
                )
                await self._db.commit()

            after = data.get("paging", {}).get("next", {}).get("after")
            if not after:
                break

        return stats

    async def _sync_batch(
        self,
        batch: list[dict],
        *,
        stats: CompanyEmailSyncStats,
        domain_to_company_id: dict[str, int],
        users_by_email: dict[str, User],
        internal_user_emails: set[str],
        sales_reps_by_owner_id: dict[str, SalesRep],
    ) -> None:
        hubspot_ids = [str(item.get("id", "")) for item in batch if item.get("id")]
        existing_emails = await self._load_existing_emails(hubspot_ids)
        existing_company_links = await self._load_existing_links(
            company_email_company,
            "company_id",
            [email.id for email in existing_emails.values()],
        )
        existing_user_links = await self._load_existing_links(
            company_email_user,
            "user_id",
            [email.id for email in existing_emails.values()],
        )

        for item in batch:
            try:
                await self._sync_one(
                    item,
                    stats=stats,
                    existing_emails=existing_emails,
                    existing_company_links=existing_company_links,
                    existing_user_links=existing_user_links,
                    domain_to_company_id=domain_to_company_id,
                    users_by_email=users_by_email,
                    internal_user_emails=internal_user_emails,
                    sales_reps_by_owner_id=sales_reps_by_owner_id,
                )
            except Exception:
                stats.failed += 1
                logger.exception(
                    "Failed to sync HubSpot email %s",
                    item.get("id"),
                )

    async def _sync_one(
        self,
        item: dict,
        *,
        stats: CompanyEmailSyncStats,
        existing_emails: dict[str, CompanyEmail],
        existing_company_links: dict[int, set[int]],
        existing_user_links: dict[int, set[int]],
        domain_to_company_id: dict[str, int],
        users_by_email: dict[str, User],
        internal_user_emails: set[str],
        sales_reps_by_owner_id: dict[str, SalesRep],
    ) -> None:
        hubspot_email_id = str(item.get("id", "")).strip()
        if not hubspot_email_id:
            return

        properties = item.get("properties", {})
        from_addresses = _parse_addresses(properties.get("hs_email_from_email"))
        from_email = from_addresses[0] if from_addresses else None
        to_emails = _parse_addresses(properties.get("hs_email_to_email"))
        cc_emails = _parse_addresses(properties.get("hs_email_cc_email"))
        bcc_emails = _parse_addresses(properties.get("hs_email_bcc_email"))
        participant_emails = _dedupe(
            [email for email in [from_email, *to_emails, *cc_emails, *bcc_emails] if email]
        )

        owner_id = (properties.get("hubspot_owner_id") or "").strip() or None
        owner_sales_rep = sales_reps_by_owner_id.get(owner_id) if owner_id else None
        owner_user = None
        if owner_sales_rep and owner_sales_rep.email:
            owner_user = users_by_email.get(owner_sales_rep.email.lower())

        company_ids, user_ids = resolve_email_associations(
            participant_emails=participant_emails,
            users_by_email=users_by_email,
            domain_to_company_id=domain_to_company_id,
            owner_user_id=owner_user.id if owner_user else None,
        )

        existing = existing_emails.get(hubspot_email_id)
        if not company_ids:
            if existing is not None:
                await self._db.delete(existing)
                stats.emails_updated += 1
            return

        occurred_at = (
            _parse_datetime(properties.get("hs_timestamp"))
            or _parse_datetime(properties.get("hs_createdate"))
            or _parse_datetime(item.get("createdAt"))
            or datetime.now(timezone.utc)
        )
        updated_at = (
            _parse_datetime(properties.get("hs_lastmodifieddate"))
            or _parse_datetime(item.get("updatedAt"))
            or occurred_at
        )
        created_at = (
            _parse_datetime(properties.get("hs_createdate"))
            or _parse_datetime(item.get("createdAt"))
            or occurred_at
        )
        if stats.last_modified_at is None or updated_at > stats.last_modified_at:
            stats.last_modified_at = updated_at

        payload = {
            "hubspot_owner_id": owner_id,
            "owner_sales_rep_id": owner_sales_rep.id if owner_sales_rep else None,
            "owner_user_id": owner_user.id if owner_user else None,
            "direction": infer_direction(
                from_email=from_email,
                to_emails=to_emails,
                cc_emails=cc_emails,
                bcc_emails=bcc_emails,
                internal_user_emails=internal_user_emails,
                owner_user_id=owner_user.id if owner_user else None,
            ),
            "hubspot_direction": (properties.get("hs_email_direction") or "").strip() or None,
            "hubspot_thread_id": (properties.get("hs_email_thread_id") or "").strip() or None,
            "hubspot_message_id": (properties.get("hs_email_message_id") or "").strip() or None,
            "hubspot_thread_summary": (
                (properties.get("hs_email_thread_summary") or "").strip() or None
            ),
            "hubspot_member_of_forwarded_subthread": _parse_bool(
                properties.get("hs_email_member_of_forwarded_subthread")
            ),
            "hubspot_status": (properties.get("hs_email_status") or "").strip() or None,
            "subject": (properties.get("hs_email_subject") or "").strip(),
            "body_preview": (properties.get("hs_body_preview") or "").strip() or None,
            "from_email": from_email,
            "to_emails": to_emails,
            "cc_emails": cc_emails,
            "bcc_emails": bcc_emails,
            "participant_emails": participant_emails,
            "occurred_at": occurred_at,
            "hubspot_created_at": created_at,
            "hubspot_updated_at": updated_at,
            "hubspot_url": item.get("url"),
            "raw_payload": item,
        }

        if existing is None:
            email = CompanyEmail(hubspot_email_id=hubspot_email_id, **payload)
            self._db.add(email)
            await self._db.flush()
            existing_emails[hubspot_email_id] = email
            existing_company_links[email.id] = set()
            existing_user_links[email.id] = set()
            stats.emails_created += 1
            changed = True
        else:
            email = existing
            current_company_ids = existing_company_links.get(email.id, set())
            current_user_ids = existing_user_links.get(email.id, set())
            changed = email_has_changes(
                existing_email=email,
                payload=payload,
                current_company_ids=current_company_ids,
                desired_company_ids=company_ids,
                current_user_ids=current_user_ids,
                desired_user_ids=user_ids,
            )
            if changed:
                for key, value in payload.items():
                    setattr(email, key, value)

        current_company_ids = existing_company_links.get(email.id, set())
        current_user_ids = existing_user_links.get(email.id, set())
        if current_company_ids != company_ids:
            await self._replace_links(
                company_email_company,
                email.id,
                "company_id",
                company_ids,
            )
            existing_company_links[email.id] = set(company_ids)
            stats.company_links_upserted += len(company_ids)
            changed = True

        if current_user_ids != user_ids:
            await self._replace_links(
                company_email_user,
                email.id,
                "user_id",
                user_ids,
            )
            existing_user_links[email.id] = set(user_ids)
            stats.user_links_upserted += len(user_ids)
            changed = True

        if existing is not None:
            if changed:
                stats.emails_updated += 1
            else:
                stats.emails_unchanged += 1

    async def _replace_links(
        self,
        table,
        company_email_id: int,
        value_column: str,
        values: set[int],
    ) -> None:
        await self._db.execute(
            delete(table).where(table.c.company_email_id == company_email_id)
        )
        if not values:
            return
        await self._db.execute(
            table.insert(),
            [
                {"company_email_id": company_email_id, value_column: value}
                for value in sorted(values)
            ],
        )

    async def _search_emails(
        self,
        *,
        start_at: datetime,
        end_at: datetime,
        after: str | None,
    ) -> dict:
        body: dict = {
            "filterGroups": [
                {
                    "filters": [
                        {
                            "propertyName": "hs_lastmodifieddate",
                            "operator": "BETWEEN",
                            "value": _to_millis(start_at),
                            "highValue": _to_millis(end_at),
                        }
                    ]
                }
            ],
            "sorts": [
                {
                    "propertyName": "hs_lastmodifieddate",
                    "direction": "ASCENDING",
                }
            ],
            "properties": EMAIL_PROPERTIES,
            "limit": self._page_size,
        }
        if after is not None:
            body["after"] = after
        return await self._api_post("/crm/v3/objects/emails/search", json_body=body)

    async def _api_post(self, path: str, *, json_body: dict) -> dict:
        url = f"{_BASE_URL}{path}"
        delay_seconds = 1.0
        for attempt in range(1, _MAX_ATTEMPTS + 1):
            try:
                response = await self._client.post(
                    url,
                    json=json_body,
                    headers={"Authorization": f"Bearer {self._access_token}"},
                )
            except httpx.RequestError:
                if attempt == _MAX_ATTEMPTS:
                    raise
                await asyncio.sleep(delay_seconds)
                delay_seconds = min(delay_seconds * 2, 30.0)
                continue

            if response.status_code == 429 or response.status_code >= 500:
                if attempt == _MAX_ATTEMPTS:
                    response.raise_for_status()
                retry_after = response.headers.get("Retry-After")
                wait_seconds = (
                    float(retry_after)
                    if retry_after and retry_after.isdigit()
                    else delay_seconds
                )
                await asyncio.sleep(wait_seconds)
                delay_seconds = min(delay_seconds * 2, 30.0)
                continue

            response.raise_for_status()
            return response.json()
        return {}

    async def _get_or_create_state(self) -> CompanyEmailSyncState:
        state = (
            await self._db.execute(
                select(CompanyEmailSyncState).where(
                    CompanyEmailSyncState.provider == _SYNC_PROVIDER
                )
            )
        ).scalar_one_or_none()
        if state is None:
            state = CompanyEmailSyncState(provider=_SYNC_PROVIDER)
            self._db.add(state)
            await self._db.commit()
        return state

    async def _load_domain_map(self) -> dict[str, int]:
        rows = (
            await self._db.execute(
                select(EntityDomain.domain, EntityDomain.company_id).where(
                    EntityDomain.company_id.is_not(None)
                )
            )
        ).all()
        return {
            domain.lower(): company_id
            for domain, company_id in rows
            if domain and company_id is not None
        }

    async def _load_users_by_email(self) -> dict[str, User]:
        users = (await self._db.execute(select(User))).scalars().all()
        return {
            user.email.lower(): user
            for user in users
            if user.email
        }

    async def _load_sales_reps_by_owner_id(self) -> dict[str, SalesRep]:
        sales_reps = (
            await self._db.execute(
                select(SalesRep).where(SalesRep.hubspot_owner_id.is_not(None))
            )
        ).scalars().all()
        return {
            sales_rep.hubspot_owner_id: sales_rep
            for sales_rep in sales_reps
            if sales_rep.hubspot_owner_id
        }

    async def _load_existing_emails(
        self,
        hubspot_ids: list[str],
    ) -> dict[str, CompanyEmail]:
        if not hubspot_ids:
            return {}
        emails = (
            await self._db.execute(
                select(CompanyEmail).where(
                    CompanyEmail.hubspot_email_id.in_(hubspot_ids)
                )
            )
        ).scalars().all()
        return {email.hubspot_email_id: email for email in emails}

    async def _load_existing_links(
        self,
        table,
        value_column: str,
        email_ids: list[int],
    ) -> dict[int, set[int]]:
        if not email_ids:
            return {}
        rows = (
            await self._db.execute(
                select(table.c.company_email_id, getattr(table.c, value_column)).where(
                    table.c.company_email_id.in_(email_ids)
                )
            )
        ).all()
        out: dict[int, set[int]] = {email_id: set() for email_id in email_ids}
        for company_email_id, value in rows:
            out.setdefault(company_email_id, set()).add(value)
        return out
