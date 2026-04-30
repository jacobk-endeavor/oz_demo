from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.associations import company_industry_group, pe_group_company


class AssociationRepo:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def link_company_industry_group(
        self, company_id: int, ig_id: int
    ) -> None:
        result = await self._db.execute(
            select(company_industry_group).where(
                company_industry_group.c.company_id == company_id,
                company_industry_group.c.industry_group_id == ig_id,
            )
        )
        if result.first() is None:
            await self._db.execute(
                company_industry_group.insert().values(
                    company_id=company_id, industry_group_id=ig_id
                )
            )

    async def link_company_pe_group(
        self, company_id: int, pe_group_id: int
    ) -> None:
        result = await self._db.execute(
            select(pe_group_company).where(
                pe_group_company.c.company_id == company_id,
                pe_group_company.c.pe_group_id == pe_group_id,
            )
        )
        if result.first() is None:
            await self._db.execute(
                pe_group_company.insert().values(
                    company_id=company_id, pe_group_id=pe_group_id
                )
            )
