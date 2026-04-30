from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user, require_non_basic
from app.repositories.event_visit_repo import EventVisitRepo
from app.schemas.event_visit import (
    EventVisitCompanyRead,
    EventVisitPersonRead,
)

router = APIRouter(
    prefix="/api/event-visits", tags=["event_visits"], dependencies=[Depends(require_non_basic)]
)


# Company visits
@router.get("/companies", response_model=list[EventVisitCompanyRead])
async def list_company_visits(db: AsyncSession = Depends(get_db)):
    repo = EventVisitRepo(db)
    return await repo.list_company_visits()


@router.delete("/companies/{id}", status_code=204)
async def delete_company_visit(id: int, db: AsyncSession = Depends(get_db)):
    repo = EventVisitRepo(db)
    item = await repo.get_company_visit_by_id(id)
    if not item:
        raise HTTPException(404, "Event visit not found")
    await repo.delete_company_visit(item)
    await repo.commit()


# Person visits
@router.get("/people", response_model=list[EventVisitPersonRead])
async def list_person_visits(db: AsyncSession = Depends(get_db)):
    repo = EventVisitRepo(db)
    return await repo.list_person_visits()


@router.delete("/people/{id}", status_code=204)
async def delete_person_visit(id: int, db: AsyncSession = Depends(get_db)):
    repo = EventVisitRepo(db)
    item = await repo.get_person_visit_by_id(id)
    if not item:
        raise HTTPException(404, "Event visit not found")
    await repo.delete_person_visit(item)
    await repo.commit()
