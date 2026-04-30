from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.company import Company
from app.models.industry_group import IndustryGroup
from app.repositories._base_repo import BaseRepo


class IndustryGroupRepo(BaseRepo[IndustryGroup]):
    _model = IndustryGroup

    def _list_options(self) -> tuple:
        return (selectinload(IndustryGroup.entity_domains),)

    def _default_order(self) -> tuple:
        return (IndustryGroup.name,)

    async def list_all(self) -> list[IndustryGroup]:
        result = await self._db.execute(
            select(IndustryGroup).options(selectinload(IndustryGroup.entity_domains))
        )
        return list(result.scalars().all())

    async def get_by_id(self, id: int, *, load_detail: bool = False) -> IndustryGroup | None:
        stmt = select(IndustryGroup).where(IndustryGroup.id == id)
        if load_detail:
            stmt = stmt.options(
                selectinload(IndustryGroup.entity_domains),
                selectinload(IndustryGroup.companies).selectinload(Company.entity_domains),
                selectinload(IndustryGroup.events),
            )
        result = await self._db.execute(stmt)
        return result.scalar_one_or_none()
