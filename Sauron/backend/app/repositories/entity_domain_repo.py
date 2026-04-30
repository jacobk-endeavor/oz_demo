from sqlalchemy import delete, func, select

from app.domain_utils import normalize_domain
from app.models.entity_domain import EntityDomain
from app.repositories._base_repo import BaseRepo


class EntityDomainRepo(BaseRepo[EntityDomain]):
    _model = EntityDomain

    async def get_by_domain(self, domain: str) -> EntityDomain | None:
        normalized = normalize_domain(domain) or domain.lower()
        result = await self._db.execute(
            select(EntityDomain).where(
                func.lower(EntityDomain.domain) == normalized
            )
        )
        return result.scalar_one_or_none()

    async def create(self, **kwargs) -> EntityDomain:  # type: ignore[override]
        if "domain" in kwargs and kwargs["domain"]:
            kwargs["domain"] = normalize_domain(kwargs["domain"]) or kwargs["domain"]
        ed = EntityDomain(**kwargs)
        self._db.add(ed)
        await self._db.flush()
        return ed

    async def delete_for_company(self, company_id: int) -> None:
        await self._db.execute(
            delete(EntityDomain).where(EntityDomain.company_id == company_id)
        )
        await self._db.flush()

    async def delete_for_pe_group(self, pe_group_id: int) -> None:
        await self._db.execute(
            delete(EntityDomain).where(EntityDomain.pe_group_id == pe_group_id)
        )
        await self._db.flush()

    async def delete_for_industry_group(self, industry_group_id: int) -> None:
        await self._db.execute(
            delete(EntityDomain).where(EntityDomain.industry_group_id == industry_group_id)
        )
        await self._db.flush()
