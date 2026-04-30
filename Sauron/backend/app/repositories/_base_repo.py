from __future__ import annotations

from typing import Any, Generic, TypeVar

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

T = TypeVar("T")


class BaseRepo(Generic[T]):
    """Provides standard CRUD, count, list, and session helpers for a single
    SQLAlchemy model.  Subclasses must set ``_model`` to the ORM class."""

    _model: type[T]

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # -- single-entity CRUD ---------------------------------------------------

    async def create(self, **kwargs: Any) -> T:
        entity = self._model(**kwargs)
        self._db.add(entity)
        await self._db.flush()
        return entity

    async def update(self, entity: T, data: dict) -> T:
        for key, value in data.items():
            setattr(entity, key, value)
        await self._db.flush()
        return entity

    async def delete(self, entity: T) -> None:
        await self._db.delete(entity)
        await self._db.flush()

    async def get_by_id(self, id: int) -> T | None:
        result = await self._db.execute(
            select(self._model).where(self._model.id == id)  # type: ignore[attr-defined]
        )
        return result.scalar_one_or_none()

    # -- list / count ---------------------------------------------------------

    async def count(self, filters: list) -> int:
        stmt = select(func.count(self._model.id)).select_from(self._model)  # type: ignore[attr-defined]
        if filters:
            stmt = stmt.where(*filters)
        result = await self._db.execute(stmt)
        return result.scalar_one()

    def _list_options(self) -> tuple:
        """Override to add selectinload / joinedload for list_paginated."""
        return ()

    def _default_order(self) -> tuple:
        """Override to set the fallback ORDER BY for list_paginated."""
        return ()

    async def list_paginated(
        self,
        filters: list,
        offset: int,
        limit: int,
        order_by: list | None = None,
    ) -> list[T]:
        stmt = select(self._model).offset(offset).limit(limit)
        opts = self._list_options()
        if opts:
            stmt = stmt.options(*opts)
        if filters:
            stmt = stmt.where(*filters)
        if order_by:
            stmt = stmt.order_by(*order_by)
        else:
            default = self._default_order()
            if default:
                stmt = stmt.order_by(*default)
        result = await self._db.execute(stmt)
        return list(result.scalars().all())

    # -- session helpers ------------------------------------------------------

    async def commit(self) -> None:
        await self._db.commit()

    async def refresh(self, obj: T) -> None:
        await self._db.refresh(obj)

    async def flush(self) -> None:
        await self._db.flush()

    async def rollback(self) -> None:
        await self._db.rollback()
