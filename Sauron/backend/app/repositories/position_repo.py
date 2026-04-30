from sqlalchemy import func, select

from app.models.enums import Role
from app.models.position import Position
from app.repositories._base_repo import BaseRepo


class PositionRepo(BaseRepo[Position]):
    _model = Position

    async def list_all(self) -> list[Position]:
        result = await self._db.execute(select(Position))
        return list(result.scalars().all())

    async def find_existing(
        self,
        person_id: int,
        *,
        company_id: int | None = None,
        pe_group_id: int | None = None,
        industry_group_id: int | None = None,
        role: Role | None = None,
    ) -> Position | None:
        stmt = select(Position).where(Position.person_id == person_id)
        if company_id:
            stmt = stmt.where(Position.company_id == company_id)
        elif pe_group_id:
            stmt = stmt.where(Position.pe_group_id == pe_group_id)
        elif industry_group_id:
            stmt = stmt.where(Position.industry_group_id == industry_group_id)
        if role:
            stmt = stmt.where(Position.role == role)
        stmt = stmt.limit(1)
        result = await self._db.execute(stmt)
        return result.scalar_one_or_none()

    async def find_by_person_and_company(
        self, person_id: int, company_id: int
    ) -> Position | None:
        result = await self._db.execute(
            select(Position.id).where(
                Position.person_id == person_id,
                Position.company_id == company_id,
            )
        )
        return result.scalar_one_or_none()

    async def count_for_person(self, person_id: int) -> int:
        result = await self._db.execute(
            select(func.count(Position.id)).where(Position.person_id == person_id)
        )
        return result.scalar_one()
