from sqlalchemy import select
from sqlalchemy.orm import joinedload, selectinload

from app.models.event import Event
from app.models.event_visit import EventVisitCompany, EventVisitPerson
from app.repositories._base_repo import BaseRepo


class EventRepo(BaseRepo[Event]):
    _model = Event

    def _default_order(self) -> tuple:
        return (Event.date.desc().nulls_last(), Event.name)

    async def list_all(self) -> list[Event]:
        result = await self._db.execute(select(Event))
        return list(result.scalars().all())

    async def get_by_id(self, id: int, *, load_detail: bool = False) -> Event | None:
        stmt = select(Event).where(Event.id == id)
        if load_detail:
            stmt = stmt.options(
                selectinload(Event.industry_group),
                selectinload(Event.company_visits).joinedload(EventVisitCompany.company),
                selectinload(Event.person_visits).joinedload(EventVisitPerson.person),
            )
        result = await self._db.execute(stmt)
        return result.unique().scalar_one_or_none()
