from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event_visit import EventVisitCompany, EventVisitPerson
from app.repositories._base_repo import BaseRepo


class EventVisitRepo(BaseRepo[EventVisitCompany]):
    _model = EventVisitCompany

    async def list_company_visits(self) -> list[EventVisitCompany]:
        result = await self._db.execute(select(EventVisitCompany))
        return list(result.scalars().all())

    async def list_person_visits(self) -> list[EventVisitPerson]:
        result = await self._db.execute(select(EventVisitPerson))
        return list(result.scalars().all())

    async def get_company_visit_by_id(self, id: int) -> EventVisitCompany | None:
        result = await self._db.execute(
            select(EventVisitCompany).where(EventVisitCompany.id == id)
        )
        return result.scalar_one_or_none()

    async def get_person_visit_by_id(self, id: int) -> EventVisitPerson | None:
        result = await self._db.execute(
            select(EventVisitPerson).where(EventVisitPerson.id == id)
        )
        return result.scalar_one_or_none()

    async def create_company_visit(self, **kwargs) -> EventVisitCompany:
        visit = EventVisitCompany(**kwargs)
        self._db.add(visit)
        await self._db.flush()
        return visit

    async def create_person_visit(self, **kwargs) -> EventVisitPerson:
        visit = EventVisitPerson(**kwargs)
        self._db.add(visit)
        await self._db.flush()
        return visit

    async def delete_company_visit(self, visit: EventVisitCompany) -> None:
        await self._db.delete(visit)
        await self._db.flush()

    async def delete_person_visit(self, visit: EventVisitPerson) -> None:
        await self._db.delete(visit)
        await self._db.flush()

    async def refresh(self, obj: EventVisitCompany | EventVisitPerson) -> None:  # type: ignore[override]
        await self._db.refresh(obj)
