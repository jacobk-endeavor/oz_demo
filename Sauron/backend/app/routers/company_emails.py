from __future__ import annotations

import re
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Text, cast, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.dependencies import get_db, require_admin
from app.models.associations import company_email_company, company_email_user
from app.models.company import Company
from app.models.company_email import CompanyEmail
from app.models.user import User
from app.schemas.company_email import (
    CompanyEmailCompanyRead,
    CompanyEmailFilterOptionsRead,
    CompanyEmailFilterUserRead,
    CompanyEmailMessageRead,
    CompanyEmailInboxResponse,
    CompanyEmailOwnerRead,
    CompanyEmailThreadListItem,
    CompanyEmailThreadRead,
    CompanyEmailUserRead,
)
from app.routers._helpers import display_name, parse_int_csv, parse_str_csv

router = APIRouter(
    prefix="/api/company-emails",
    tags=["company-emails"],
    dependencies=[Depends(require_admin)],
)


_COMPANION_WINDOW_SECONDS = 15 * 60
_COMPANION_WINDOW = timedelta(seconds=_COMPANION_WINDOW_SECONDS)
_PSEUDO_THREAD_PREFIX = "email:"
_SUBJECT_PREFIX_RE = re.compile(
    r"^\s*((email:|re:|fw:|fwd:|<<|>>)\s*)+",
    re.IGNORECASE,
)
_SUBJECT_WHITESPACE_RE = re.compile(r"\s+")


def _base_thread_key_expr(email_model=CompanyEmail):
    return func.coalesce(
        email_model.hubspot_thread_id,
        func.concat(_PSEUDO_THREAD_PREFIX, email_model.hubspot_email_id),
    )


def _owner_payload(email: CompanyEmail) -> CompanyEmailOwnerRead | None:
    owner_user = email.owner_user
    owner_sales_rep = email.owner_sales_rep

    if (
        not email.hubspot_owner_id
        and owner_user is None
        and owner_sales_rep is None
    ):
        return None

    if owner_user is not None:
        return CompanyEmailOwnerRead(
            hubspot_owner_id=email.hubspot_owner_id,
            sales_rep_id=owner_sales_rep.id if owner_sales_rep else None,
            user_id=owner_user.id,
            display_name=display_name(owner_user),
            email=owner_user.email,
        )

    return CompanyEmailOwnerRead(
        hubspot_owner_id=email.hubspot_owner_id,
        sales_rep_id=owner_sales_rep.id if owner_sales_rep else None,
        user_id=None,
        display_name=display_name(owner_sales_rep) if owner_sales_rep else None,
        email=owner_sales_rep.email if owner_sales_rep else None,
    )


def _serialize_message(email: CompanyEmail) -> CompanyEmailMessageRead:
    return CompanyEmailMessageRead(
        id=email.id,
        hubspot_email_id=email.hubspot_email_id,
        hubspot_thread_id=email.hubspot_thread_id,
        hubspot_message_id=email.hubspot_message_id,
        hubspot_thread_summary=email.hubspot_thread_summary,
        hubspot_member_of_forwarded_subthread=email.hubspot_member_of_forwarded_subthread,
        direction=email.direction,
        hubspot_direction=email.hubspot_direction,
        hubspot_status=email.hubspot_status,
        subject=email.subject,
        body_preview=email.body_preview,
        from_email=email.from_email,
        to_emails=email.to_emails or [],
        cc_emails=email.cc_emails or [],
        bcc_emails=email.bcc_emails or [],
        participant_emails=email.participant_emails or [],
        occurred_at=email.occurred_at,
        hubspot_url=email.hubspot_url,
        companies=[
            CompanyEmailCompanyRead(id=company.id, name=company.name)
            for company in sorted(
                email.companies,
                key=lambda company: (company.name or "").lower(),
            )
        ],
        users=[
            CompanyEmailUserRead(
                id=user.id,
                email=user.email,
                display_name=display_name(user),
            )
            for user in sorted(
                email.users,
                key=lambda user: (
                    (user.first_name or "").lower(),
                    (user.last_name or "").lower(),
                    (user.email or "").lower(),
                ),
            )
        ],
        owner=_owner_payload(email),
    )


def _aggregate_companies(messages: list[CompanyEmail]) -> list[CompanyEmailCompanyRead]:
    company_by_id = {}
    for email in messages:
        for company in email.companies:
            company_by_id[company.id] = CompanyEmailCompanyRead(
                id=company.id,
                name=company.name,
            )
    return [
        company_by_id[company_id]
        for company_id in sorted(
            company_by_id,
            key=lambda company_id: company_by_id[company_id].name.lower(),
        )
    ]


def _aggregate_users(messages: list[CompanyEmail]) -> list[CompanyEmailUserRead]:
    user_by_id = {}
    for email in messages:
        for user in email.users:
            user_by_id[user.id] = CompanyEmailUserRead(
                id=user.id,
                email=user.email,
                display_name=display_name(user),
            )
    return [
        user_by_id[user_id]
        for user_id in sorted(
            user_by_id,
            key=lambda user_id: (
                user_by_id[user_id].display_name.lower(),
                user_by_id[user_id].email.lower(),
            ),
        )
    ]


def _sort_messages_desc(messages: list[CompanyEmail]) -> list[CompanyEmail]:
    return sorted(
        messages,
        key=lambda email: (email.occurred_at, email.id),
        reverse=True,
    )


def _normalize_subject(subject: str | None) -> str:
    normalized = _SUBJECT_PREFIX_RE.sub("", (subject or "").lower())
    normalized = _SUBJECT_WHITESPACE_RE.sub(" ", normalized)
    return normalized.strip()


def _normalize_participants(participants: list[str] | None) -> tuple[str, ...]:
    return tuple(sorted(email.lower() for email in (participants or []) if email))


def _message_signature(email: CompanyEmail) -> tuple[str, tuple[str, ...]]:
    return (
        _normalize_subject(email.subject),
        _normalize_participants(email.participant_emails),
    )


def _email_distance_seconds(left: CompanyEmail, right: CompanyEmail) -> float:
    return abs((left.occurred_at - right.occurred_at).total_seconds())


def _matches_companion(threaded_messages: list[CompanyEmail], candidate: CompanyEmail) -> bool:
    candidate_signature = _message_signature(candidate)
    for threaded in threaded_messages:
        if _message_signature(threaded) != candidate_signature:
            continue
        if _email_distance_seconds(threaded, candidate) <= _COMPANION_WINDOW_SECONDS:
            return True
    return False


def _dedupe_messages(messages: list[CompanyEmail]) -> list[CompanyEmail]:
    seen_ids: set[int] = set()
    deduped: list[CompanyEmail] = []
    for email in sorted(messages, key=lambda message: (message.occurred_at, message.id)):
        if email.id in seen_ids:
            continue
        seen_ids.add(email.id)
        deduped.append(email)
    return deduped


def _resolved_hubspot_thread_id(messages: list[CompanyEmail]) -> str | None:
    return next(
        (email.hubspot_thread_id for email in messages if email.hubspot_thread_id),
        None,
    )


def _resolved_thread_summary(messages: list[CompanyEmail]) -> str | None:
    return next(
        (email.hubspot_thread_summary for email in messages if email.hubspot_thread_summary),
        None,
    )


def _build_thread_list_item(
    thread_key: str,
    messages: list[CompanyEmail],
) -> CompanyEmailThreadListItem:
    ordered = _sort_messages_desc(messages)
    latest = ordered[0]
    return CompanyEmailThreadListItem(
        thread_key=thread_key,
        hubspot_thread_id=_resolved_hubspot_thread_id(ordered),
        hubspot_thread_summary=_resolved_thread_summary(ordered),
        message_count=len(messages),
        latest_message=_serialize_message(latest),
        companies=_aggregate_companies(messages),
        users=_aggregate_users(messages),
    )


def _build_thread_detail(
    thread_key: str,
    messages: list[CompanyEmail],
) -> CompanyEmailThreadRead:
    deduped_messages = _dedupe_messages(messages)
    ordered_desc = _sort_messages_desc(deduped_messages)
    latest = ordered_desc[0]
    ordered_asc = list(reversed(ordered_desc))
    return CompanyEmailThreadRead(
        thread_key=thread_key,
        hubspot_thread_id=_resolved_hubspot_thread_id(ordered_desc),
        hubspot_thread_summary=_resolved_thread_summary(ordered_desc),
        message_count=len(deduped_messages),
        latest_occurred_at=latest.occurred_at,
        companies=_aggregate_companies(deduped_messages),
        users=_aggregate_users(deduped_messages),
        messages=[_serialize_message(email) for email in ordered_asc],
    )


def _email_load_options():
    return (
        selectinload(CompanyEmail.companies),
        selectinload(CompanyEmail.users),
        joinedload(CompanyEmail.owner_user),
        joinedload(CompanyEmail.owner_sales_rep),
    )


async def _load_email_by_hubspot_email_id(
    db: AsyncSession,
    hubspot_email_id: str,
) -> CompanyEmail | None:
    return (
        await db.execute(
            select(CompanyEmail)
            .where(CompanyEmail.hubspot_email_id == hubspot_email_id)
            .options(*_email_load_options())
        )
    ).scalars().unique().one_or_none()


async def _load_messages_by_hubspot_thread_id(
    db: AsyncSession,
    hubspot_thread_id: str,
) -> list[CompanyEmail]:
    return (
        await db.execute(
            select(CompanyEmail)
            .where(CompanyEmail.hubspot_thread_id == hubspot_thread_id)
            .options(*_email_load_options())
            .order_by(CompanyEmail.occurred_at.asc(), CompanyEmail.id.asc())
        )
    ).scalars().unique().all()


async def _load_companion_messages(
    db: AsyncSession,
    threaded_messages: list[CompanyEmail],
) -> list[CompanyEmail]:
    if not threaded_messages:
        return []

    window_start = min(email.occurred_at for email in threaded_messages) - _COMPANION_WINDOW
    window_end = max(email.occurred_at for email in threaded_messages) + _COMPANION_WINDOW

    candidates = (
        await db.execute(
            select(CompanyEmail)
            .where(
                CompanyEmail.hubspot_thread_id.is_(None),
                CompanyEmail.occurred_at >= window_start,
                CompanyEmail.occurred_at <= window_end,
            )
            .options(*_email_load_options())
            .order_by(CompanyEmail.occurred_at.asc(), CompanyEmail.id.asc())
        )
    ).scalars().unique().all()

    return [
        candidate
        for candidate in candidates
        if _matches_companion(threaded_messages, candidate)
    ]


async def _find_matching_thread_id_for_unthreaded_email(
    db: AsyncSession,
    email: CompanyEmail,
) -> str | None:
    candidates = (
        await db.execute(
            select(CompanyEmail)
            .where(
                CompanyEmail.id != email.id,
                CompanyEmail.hubspot_thread_id.is_not(None),
                CompanyEmail.occurred_at >= email.occurred_at - _COMPANION_WINDOW,
                CompanyEmail.occurred_at <= email.occurred_at + _COMPANION_WINDOW,
            )
        )
    ).scalars().all()

    matching = [
        candidate
        for candidate in candidates
        if _matches_companion([candidate], email)
    ]
    if not matching:
        return None

    best_match = min(
        matching,
        key=lambda candidate: (
            _email_distance_seconds(candidate, email),
            -candidate.id,
        ),
    )
    return best_match.hubspot_thread_id


def _search_filter(search: str):
    normalized = search.strip().lower()
    if not normalized:
        return None

    pattern = f"%{normalized}%"
    company_name_match = exists(
        select(Company.id)
        .select_from(
            company_email_company.join(
                Company,
                Company.id == company_email_company.c.company_id,
            )
        )
        .where(
            company_email_company.c.company_email_id == CompanyEmail.id,
            func.lower(func.coalesce(Company.name, "")).like(pattern),
        )
    )
    return or_(
        func.lower(func.coalesce(CompanyEmail.subject, "")).like(pattern),
        func.lower(func.coalesce(CompanyEmail.body_preview, "")).like(pattern),
        func.lower(func.coalesce(CompanyEmail.from_email, "")).like(pattern),
        cast(CompanyEmail.participant_emails, Text).ilike(pattern),
        company_name_match,
    )


def _user_filter(user_ids: list[int]):
    if not user_ids:
        return None

    return exists(
        select(company_email_user.c.company_email_id).where(
            company_email_user.c.company_email_id == CompanyEmail.id,
            company_email_user.c.user_id.in_(user_ids),
        )
    )


@router.get("/filter-options", response_model=CompanyEmailFilterOptionsRead)
async def company_email_filter_options(
    db: AsyncSession = Depends(get_db),
):
    user_rows = (
        await db.execute(
            select(
                User.id,
                User.email,
                User.first_name,
                User.last_name,
                func.count(func.distinct(_base_thread_key_expr())).label("thread_count"),
            )
            .join(company_email_user, company_email_user.c.user_id == User.id)
            .join(CompanyEmail, CompanyEmail.id == company_email_user.c.company_email_id)
            .group_by(User.id, User.email, User.first_name, User.last_name)
            .order_by(
                func.lower(func.coalesce(User.first_name, "")),
                func.lower(func.coalesce(User.last_name, "")),
                func.lower(func.coalesce(User.email, "")),
            )
        )
    ).all()

    return CompanyEmailFilterOptionsRead(
        users=[
            CompanyEmailFilterUserRead(
                id=row.id,
                email=row.email,
                display_name=display_name(row) or row.email,
                thread_count=row.thread_count,
            )
            for row in user_rows
            if row.email
        ],
        directions=["received", "sent"],
    )


@router.get("", response_model=CompanyEmailInboxResponse)
async def list_company_emails(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: str | None = Query(None),
    direction: str | None = Query(None, pattern="^(sent|received)$"),
    directions: str | None = Query(None),
    user_ids: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    filters = []
    if search and search.strip():
        search_clause = _search_filter(search)
        if search_clause is not None:
            filters.append(search_clause)

    parsed_user_ids = parse_int_csv(user_ids)
    user_clause = _user_filter(parsed_user_ids)
    if user_clause is not None:
        filters.append(user_clause)

    parsed_directions = [
        raw for raw in parse_str_csv(directions) if raw in {"sent", "received"}
    ]
    if direction and direction not in parsed_directions:
        parsed_directions.append(direction)
    if parsed_directions:
        filters.append(CompanyEmail.direction.in_(parsed_directions))

    thread_key_expr = _base_thread_key_expr()
    matching_threads = (
        select(thread_key_expr.label("thread_key"))
        .where(*filters)
        .group_by(thread_key_expr)
        .subquery()
    )
    total = (
        await db.execute(
            select(func.count()).select_from(matching_threads)
        )
    ).scalar() or 0

    offset = (page - 1) * page_size
    ordered_threads = (
        await db.execute(
            select(
                thread_key_expr.label("thread_key"),
                func.max(CompanyEmail.occurred_at).label("latest_occurred_at"),
            )
            .where(
                thread_key_expr.in_(select(matching_threads.c.thread_key))
            )
            .group_by(thread_key_expr)
            .order_by(
                func.max(CompanyEmail.occurred_at).desc(),
                thread_key_expr.desc(),
            )
            .offset(offset)
            .limit(page_size)
        )
    ).all()

    thread_keys = [row.thread_key for row in ordered_threads]
    if not thread_keys:
        return CompanyEmailInboxResponse(
            items=[],
            total=total,
            page=page,
            page_size=page_size,
            total_pages=0,
        )

    rows = (
        await db.execute(
            select(CompanyEmail, _base_thread_key_expr().label("thread_key"))
            .where(_base_thread_key_expr().in_(thread_keys))
            .options(*_email_load_options())
            .order_by(CompanyEmail.occurred_at.desc(), CompanyEmail.id.desc())
        )
    ).unique().all()

    messages_by_thread: dict[str, list[CompanyEmail]] = {
        thread_key: [] for thread_key in thread_keys
    }
    for email, thread_key in rows:
        messages_by_thread.setdefault(thread_key, []).append(email)

    total_pages = (total + page_size - 1) // page_size if total else 0
    return CompanyEmailInboxResponse(
        items=[
            _build_thread_list_item(thread_key, messages_by_thread[thread_key])
            for thread_key in thread_keys
            if messages_by_thread.get(thread_key)
        ],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/thread", response_model=CompanyEmailThreadRead)
async def get_company_email_thread(
    thread_key: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
):
    if thread_key.startswith(_PSEUDO_THREAD_PREFIX):
        hubspot_email_id = thread_key.removeprefix(_PSEUDO_THREAD_PREFIX)
        email = await _load_email_by_hubspot_email_id(db, hubspot_email_id)
        if email is None:
            raise HTTPException(404, "Email thread not found")

        resolved_thread_id = await _find_matching_thread_id_for_unthreaded_email(db, email)
        if resolved_thread_id is None:
            return _build_thread_detail(thread_key, [email])

        threaded_messages = await _load_messages_by_hubspot_thread_id(db, resolved_thread_id)
        companion_messages = await _load_companion_messages(db, threaded_messages)
        return _build_thread_detail(
            resolved_thread_id,
            [*threaded_messages, *companion_messages, email],
        )

    threaded_messages = await _load_messages_by_hubspot_thread_id(db, thread_key)
    if not threaded_messages:
        raise HTTPException(404, "Email thread not found")

    companion_messages = await _load_companion_messages(db, threaded_messages)
    return _build_thread_detail(
        thread_key,
        [*threaded_messages, *companion_messages],
    )
