from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.company import Company
from app.models.pe_group import PEGroup
from app.repositories._base_repo import BaseRepo


class PEGroupRepo(BaseRepo[PEGroup]):
    _model = PEGroup

    def _list_options(self) -> tuple:
        return (selectinload(PEGroup.entity_domains),)

    def _default_order(self) -> tuple:
        return (PEGroup.name,)

    async def list_all(self) -> list[PEGroup]:
        result = await self._db.execute(
            select(PEGroup).options(selectinload(PEGroup.entity_domains))
        )
        return list(result.scalars().all())

    async def get_by_id(self, id: int, *, load_detail: bool = False) -> PEGroup | None:
        stmt = select(PEGroup).where(PEGroup.id == id)
        if load_detail:
            stmt = stmt.options(
                selectinload(PEGroup.entity_domains),
                selectinload(PEGroup.companies).selectinload(
                    Company.entity_domains
                ),
            )
        result = await self._db.execute(stmt)
        return result.scalar_one_or_none()
