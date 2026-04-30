from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.models.person import Person
from app.models.position import Position
from app.repositories._base_repo import BaseRepo


class PersonRepo(BaseRepo[Person]):
    _model = Person

    def _default_order(self) -> tuple:
        return (Person.last_name, Person.first_name)

    async def list_all(self) -> list[Person]:
        result = await self._db.execute(select(Person))
        return list(result.scalars().all())

    async def get_by_id(self, id: int, *, load_detail: bool = False) -> Person | None:
        stmt = select(Person).where(Person.id == id)
        if load_detail:
            from app.models.meeting import Meeting

            stmt = stmt.options(
                selectinload(Person.positions).joinedload(Position.company),
                selectinload(Person.positions).joinedload(Position.pe_group),
                selectinload(Person.positions).joinedload(Position.industry_group),
                selectinload(Person.donations),
                selectinload(Person.meetings).selectinload(Meeting.sales_reps),
            )
        result = await self._db.execute(stmt)
        return result.unique().scalar_one_or_none()

    async def get_by_email(self, email: str) -> Person | None:
        result = await self._db.execute(
            select(Person).where(func.lower(Person.email) == email.lower())
        )
        return result.scalar_one_or_none()

    async def get_by_hubspot_contact_id(self, hubspot_contact_id: str) -> Person | None:
        result = await self._db.execute(
            select(Person).where(Person.hubspot_contact_id == hubspot_contact_id)
        )
        return result.scalar_one_or_none()

    async def get_by_name(self, first: str, last: str) -> Person | None:
        result = await self._db.execute(
            select(Person).where(
                func.lower(Person.first_name) == first.lower(),
                func.lower(Person.last_name) == last.lower(),
            )
        )
        return result.scalar_one_or_none()

    async def get_by_name_limited(self, first: str, last: str) -> list[Person]:
        """Return up to 2 people matching the given name (for ambiguity detection)."""
        result = await self._db.execute(
            select(Person)
            .where(
                func.lower(Person.first_name) == first.lower(),
                func.lower(Person.last_name) == last.lower(),
            )
            .order_by(Person.id.asc())
            .limit(2)
        )
        return list(result.scalars().all())

    async def list_known_emails(self, emails: list[str]) -> set[str]:
        result = await self._db.execute(
            select(func.lower(Person.email)).where(
                func.lower(Person.email).in_(emails)
            )
        )
        return set(result.scalars().all())
