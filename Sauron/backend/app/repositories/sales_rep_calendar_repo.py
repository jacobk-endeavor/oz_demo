from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.sales_rep import SalesRep
from app.models.sales_rep_calendar import SalesRepCalendar
from app.repositories._base_repo import BaseRepo


class SalesRepCalendarRepo(BaseRepo[SalesRepCalendar]):
    _model = SalesRepCalendar

    async def list_by_sales_rep(self, sales_rep_id: int) -> list[SalesRepCalendar]:
        result = await self._db.execute(
            select(SalesRepCalendar)
            .where(SalesRepCalendar.sales_rep_id == sales_rep_id)
            .order_by(SalesRepCalendar.label)
        )
        return list(result.scalars().all())

    async def list_all_with_sales_rep(self) -> list[SalesRepCalendar]:
        result = await self._db.execute(
            select(SalesRepCalendar)
            .options(selectinload(SalesRepCalendar.sales_rep))
            .order_by(SalesRepCalendar.id)
        )
        return list(result.scalars().all())
