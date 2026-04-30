"""Shared utility functions for API routers."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import UserRole
from app.models.sales_rep import SalesRep
from app.models.user import User
from app.repositories.sales_rep_repo import SalesRepRepo


def parse_int_csv(raw: str | None) -> list[int]:
    """Parse a comma-separated string of integers (e.g. query params)."""
    if not raw or not raw.strip():
        return []
    return [int(p) for p in raw.split(",") if p.strip().isdigit()]


def parse_str_csv(raw: str | None) -> list[str]:
    """Parse a comma-separated string, stripping whitespace."""
    if not raw or not raw.strip():
        return []
    return [s.strip() for s in raw.split(",") if s.strip()]


def display_name(entity, *, fallback: str | None = "Unknown") -> str | None:
    """Format a person/sales-rep entity into a display name string."""
    if not entity:
        return fallback
    full_name = " ".join(
        part for part in [entity.first_name, entity.last_name] if part
    ).strip()
    return full_name or getattr(entity, "email", None) or fallback


def restricts_to_assigned_leads(user: User) -> bool:
    """Whether the user should only access leads explicitly assigned to them."""
    return user.role in (UserRole.BDR, UserRole.AE)


async def get_ae_sales_rep(current_user: User, db: AsyncSession) -> SalesRep | None:
    """Resolve the sales-rep record tied to an AE user via email."""
    if current_user.role != UserRole.AE:
        return None
    email = (current_user.email or "").strip()
    if not email:
        return None
    return await SalesRepRepo(db).get_by_email(email)
