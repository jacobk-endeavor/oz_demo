from sqlalchemy.orm import selectinload

from app.models.deal import Deal
from app.repositories._base_repo import BaseRepo


class DealRepo(BaseRepo[Deal]):
    _model = Deal

    def _list_options(self) -> tuple:
        return (
            selectinload(Deal.company),
            selectinload(Deal.point_of_contact),
            selectinload(Deal.sales_rep),
        )

    def _default_order(self) -> tuple:
        return (Deal.close_date.desc().nulls_last(), Deal.id.asc())

    async def get_by_hubspot_deal_id(self, hubspot_deal_id: str) -> Deal | None:
        from sqlalchemy import select

        result = await self._db.execute(
            select(Deal).where(Deal.hubspot_deal_id == hubspot_deal_id)
        )
        return result.scalar_one_or_none()
