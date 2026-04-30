from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.models.sales_rep import SalesRep
from app.repositories._base_repo import BaseRepo


class SalesRepRepo(BaseRepo[SalesRep]):
    _model = SalesRep

    def _default_order(self) -> tuple:
        return (SalesRep.last_name, SalesRep.first_name)

    async def list_all(self) -> list[SalesRep]:
        result = await self._db.execute(select(SalesRep).order_by(SalesRep.last_name, SalesRep.first_name))
        return list(result.scalars().all())

    async def get_by_id(self, id: int, *, load_calendars: bool = False) -> SalesRep | None:
        stmt = select(SalesRep).where(SalesRep.id == id)
        if load_calendars:
            stmt = stmt.options(selectinload(SalesRep.calendars))
        result = await self._db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_hubspot_owner_id(self, hubspot_owner_id: str) -> SalesRep | None:
        result = await self._db.execute(
            select(SalesRep).where(SalesRep.hubspot_owner_id == hubspot_owner_id)
        )
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> SalesRep | None:
        result = await self._db.execute(
            select(SalesRep).where(func.lower(SalesRep.email) == email.lower())
        )
        return result.scalar_one_or_none()

    async def list_id_email_pairs(self) -> list[tuple[int, str]]:
        result = await self._db.execute(
            select(SalesRep.id, SalesRep.email).where(SalesRep.email.is_not(None))
        )
        return list(result.all())

    async def list_known_emails(self, emails: list[str]) -> set[str]:
        result = await self._db.execute(
            select(func.lower(SalesRep.email)).where(
                func.lower(SalesRep.email).in_(emails)
            )
        )
        return set(result.scalars().all())

    async def search(self, pattern: str, limit: int) -> list[SalesRep]:
        search_pattern = f"%{pattern}%"
        result = await self._db.execute(
            select(SalesRep)
            .where(
                or_(
                    SalesRep.first_name.ilike(search_pattern),
                    SalesRep.last_name.ilike(search_pattern),
                    SalesRep.email.ilike(search_pattern),
                )
            )
            .order_by(SalesRep.first_name.asc(), SalesRep.last_name.asc(), SalesRep.email.asc())
            .limit(limit)
        )
        return list(result.scalars().all())
