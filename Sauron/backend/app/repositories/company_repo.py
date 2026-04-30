from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.domain_utils import normalize_domain
from app.models.associations import meeting_person
from app.models.company import Company
from app.models.company_hubspot_id import CompanyHubspotId
from app.models.entity_domain import EntityDomain
from app.models.industry_group import IndustryGroup
from app.models.meeting import Meeting
from app.models.person import Person
from app.models.position import Position
from app.repositories._base_repo import BaseRepo


class CompanyRepo(BaseRepo[Company]):
    _model = Company

    def _list_options(self) -> tuple:
        return (selectinload(Company.entity_domains),)

    def _default_order(self) -> tuple:
        return (Company.name,)

    async def list_all(self, search: str | None = None) -> list[Company]:
        stmt = select(Company).options(selectinload(Company.entity_domains))
        if search:
            from sqlalchemy import exists, or_

            pattern = f"%{search}%"
            domain_exists = exists(
                select(EntityDomain.id).where(
                    EntityDomain.company_id == Company.id,
                    EntityDomain.domain.ilike(pattern),
                )
            )
            stmt = stmt.where(or_(Company.name.ilike(pattern), domain_exists))
        stmt = stmt.order_by(Company.name)
        result = await self._db.execute(stmt)
        return list(result.scalars().all())

    async def get_by_id(self, id: int, *, load_detail: bool = False) -> Company | None:
        stmt = select(Company).where(Company.id == id)
        if load_detail:
            stmt = stmt.options(
                selectinload(Company.entity_domains),
                joinedload(Company.parent_company).selectinload(
                    Company.entity_domains
                ),
                selectinload(Company.subsidiaries).selectinload(Company.entity_domains),
                selectinload(Company.industry_groups).selectinload(
                    IndustryGroup.entity_domains
                ),
                selectinload(Company.positions).joinedload(Position.person),
                selectinload(Company.meetings).selectinload(Meeting.sales_reps),
            )
        result = await self._db.execute(stmt)
        return result.unique().scalar_one_or_none()

    async def get_meeting_counts_by_person(
        self, person_ids: list[int]
    ) -> dict[int, int]:
        if not person_ids:
            return {}
        stmt = (
            select(
                meeting_person.c.person_id,
                func.count(meeting_person.c.meeting_id),
            )
            .where(meeting_person.c.person_id.in_(person_ids))
            .group_by(meeting_person.c.person_id)
        )
        rows = await self._db.execute(stmt)
        return dict(rows.all())

    async def get_by_domain(self, domain: str) -> Company | None:
        normalized = normalize_domain(domain) or domain.lower()
        result = await self._db.execute(
            select(Company)
            .join(EntityDomain, EntityDomain.company_id == Company.id)
            .where(func.lower(EntityDomain.domain) == normalized)
        )
        return result.scalar_one_or_none()

    async def get_by_hubspot_company_id(
        self, hubspot_company_id: str
    ) -> Company | None:
        result = await self._db.execute(
            select(Company)
            .join(CompanyHubspotId, CompanyHubspotId.company_id == Company.id)
            .where(CompanyHubspotId.hubspot_company_id == hubspot_company_id)
        )
        return result.scalar_one_or_none()

    async def get_by_name(self, name: str) -> Company | None:
        result = await self._db.execute(
            select(Company).where(func.lower(Company.name) == name.lower())
        )
        return result.scalar_one_or_none()
